import { computed, Injectable, signal } from '@angular/core';
import { createClient, type Session } from '@supabase/supabase-js';
import type { Product } from '../models/product.model';
import type { PriceRule } from '../models/price-rule.model';
import { environment } from '../../../environments/environment';

export interface PriceHistoryEntry {
  product_code: string;
  previous_price: number;
  new_price: number;
  source: 'manual_edit' | 'rule_apply';
  changed_at?: string;
  cost_snapshot?: number | null;
  gross_margin_baht?: number | null;
  override_name?: string | null;
  override_reason?: string | null;
}

export interface ProductCost { product_code: string; cog: number; effective_at: string; }
export interface CostImportRow { code: string; name: string; group: string; price: number | null; cog: number | null; }
export interface CostImportResult { import_id: string; accepted_rows: number; invalid_rows: number; duplicate_rows: number; product_not_found_rows: number; }

@Injectable({ providedIn: 'root' })
export class SupabaseDataService {
  private readonly client = createClient(environment.supabaseUrl, environment.supabasePublishableKey);
  readonly session = signal<Session | null>(null);
  readonly authReady = signal(false);
  readonly email = computed(() => this.session()?.user.email ?? '');
  readonly role = computed(() => {
    const metadata = this.session()?.user.app_metadata ?? {};
    return typeof metadata['role'] === 'string' ? metadata['role'] : '';
  });
  readonly canManagePrices = computed(() => ['admin', 'price_admin'].includes(this.role()));

  constructor() {
    void this.restoreSession();
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.authReady.set(true);
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.session.set(data.session);
  }

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.session.set(null);
  }

  private async restoreSession(): Promise<void> {
    const { data, error } = await this.client.auth.getSession();
    if (!error) this.session.set(data.session);
    this.authReady.set(true);
  }

  private async ensureSession(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (data.session) return;
    const { error } = await this.client.auth.signInAnonymously();
    if (error) throw error;
  }

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

  async loadCurrentCosts(): Promise<ProductCost[]> {
    await this.ensureSession();
    const { data, error } = await this.client.from('current_product_costs').select('product_code,cog,effective_at');
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, cog: Number(row.cog) })) as ProductCost[];
  }

  async importCosts(fileName: string, importedBy: string, rows: readonly CostImportRow[]): Promise<CostImportResult> {
    await this.ensureSession();
    const { data, error } = await this.client.rpc('import_product_costs', {
      p_file_name: fileName,
      p_imported_by: importedBy,
      p_rows: rows.map((row) => ({ ...row, price: row.price ?? '', cog: row.cog ?? '' })),
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    return result as CostImportResult;
  }

  async applyPriceChanges(changes: readonly { code: string; newPrice: number; source: 'manual_edit' | 'rule_apply'; overrideName?: string; overrideReason?: string; }[]): Promise<void> {
    await this.ensureSession();
    const { error } = await this.client.rpc('apply_product_price_changes', {
      p_changes: changes.map((change) => ({
        code: change.code, new_price: change.newPrice, source: change.source,
        override_name: change.overrideName ?? '', override_reason: change.overrideReason ?? '',
      })),
    });
    if (error) throw error;
  }

  async loadPriceHistory(productCode: string): Promise<PriceHistoryEntry[]> {
    const { data, error } = await this.client.from('price_history')
      .select('product_code,previous_price,new_price,source,changed_at,cost_snapshot,gross_margin_baht,override_name,override_reason')
      .eq('product_code', productCode)
      .order('changed_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((entry) => ({ ...entry, previous_price: Number(entry.previous_price), new_price: Number(entry.new_price), cost_snapshot: entry.cost_snapshot === null ? null : Number(entry.cost_snapshot), gross_margin_baht: entry.gross_margin_baht === null ? null : Number(entry.gross_margin_baht) })) as PriceHistoryEntry[];
  }

  async deleteProducts(codes: readonly string[]): Promise<void> {
    const batchSize = 250;
    for (let start = 0; start < codes.length; start += batchSize) {
      const { error } = await this.client.from('products').delete().in('code', codes.slice(start, start + batchSize));
      if (error) throw error;
    }
  }
}
