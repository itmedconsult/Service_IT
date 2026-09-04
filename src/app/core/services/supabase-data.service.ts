import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import type { Product } from '../models/product.model';
import type { PriceRule } from '../models/price-rule.model';
import { environment } from '../../../environments/environment';

export interface PriceHistoryEntry {
  product_code: string;
  previous_price: number;
  new_price: number;
  source: 'manual_edit' | 'rule_apply';
  changed_at?: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseDataService {
  private readonly client = createClient(environment.supabaseUrl, environment.supabasePublishableKey);

  async loadProducts(): Promise<Product[]> {
    // PostgREST limits a single response to 1,000 rows by default. Fetch every
    // page so imports larger than that do not appear to disappear on refresh.
    const pageSize = 1_000;
    const rows: Array<{
      code: string;
      name: string;
      group: string;
      type: string;
      price: number | string;
      active: boolean;
      df_enabled: boolean;
      df_percent: number | string | null;
    }> = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('products')
        .select('code,name,group,type,price,active,df_enabled,df_percent')
        .order('code')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) break;
    }
    return rows.map((product) => ({
      code: product.code,
      name: product.name,
      group: product.group,
      type: product.type,
      price: Number(product.price),
      active: product.active,
      dfEnabled: product.df_enabled === true,
      dfPercent: product.df_enabled === true && product.df_percent !== null ? Number(product.df_percent) : null,
    }));
  }

  async upsertProducts(products: readonly Product[]): Promise<void> {
    const batchSize = 250;
    for (let start = 0; start < products.length; start += batchSize) {
      const records = products.slice(start, start + batchSize).map((product) => ({
        code: product.code,
        name: product.name,
        group: product.group,
        type: product.type,
        price: product.price,
        active: product.active,
        df_enabled: product.dfEnabled,
        df_percent: product.dfEnabled ? (product.dfPercent ?? 0) : null,
      }));
      const { error } = await this.client.from('products').upsert(records, { onConflict: 'code' });
      if (error) throw error;
    }
  }

  async loadRules(): Promise<PriceRule[]> {
    const { data, error } = await this.client.from('price_rules').select('id,name,group,mode,value').order('created_at');
    if (error) throw error;
    return (data ?? []).map((rule) => ({ ...rule, value: Number(rule.value) })) as PriceRule[];
  }

  async upsertRule(rule: PriceRule): Promise<void> {
    const { error } = await this.client.from('price_rules').upsert(rule);
    if (error) throw error;
  }

  async deleteRule(id: string): Promise<void> {
    const { error } = await this.client.from('price_rules').delete().eq('id', id);
    if (error) throw error;
  }

  async addPriceHistory(entries: readonly PriceHistoryEntry[]): Promise<void> {
    if (!entries.length) return;
    const { error } = await this.client.from('price_history').insert(entries);
    if (error) throw error;
  }

  async loadPriceHistory(productCode: string): Promise<PriceHistoryEntry[]> {
    const { data, error } = await this.client.from('price_history')
      .select('product_code,previous_price,new_price,source,changed_at')
      .eq('product_code', productCode)
      .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((entry) => ({ ...entry, previous_price: Number(entry.previous_price), new_price: Number(entry.new_price) })) as PriceHistoryEntry[];
  }

  async deleteProducts(codes: readonly string[]): Promise<void> {
    const batchSize = 250;
    for (let start = 0; start < codes.length; start += batchSize) {
      const { error } = await this.client.from('products').delete().in('code', codes.slice(start, start + batchSize));
      if (error) throw error;
    }
  }
}
