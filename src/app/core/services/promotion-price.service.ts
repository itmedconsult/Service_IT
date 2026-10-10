import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface PromotionPrice {
  table_id: string;
  table_name: string;
  row_index: number;
  column_index: number;
  label: string;
  price: number;
  raw: string;
}

interface PromotionPricesResponse {
  ok: boolean;
  page_url: string;
  items: PromotionPrice[];
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class PromotionPriceService {
  private readonly endpoint = `${environment.wordpressBaseUrl}/wp-json/medconsult-price-sync/v1/promotion-prices`;

  async load(): Promise<PromotionPricesResponse> {
    const response = await fetch(this.endpoint, { cache: 'no-store' });
    const data = await response.json() as PromotionPricesResponse;
    if (!response.ok || !data.ok) throw new Error(data.message ?? `WordPress returned ${response.status}`);
    return data;
  }

  async update(item: PromotionPrice, price: number, token: string): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_id: item.table_id,
        row_index: item.row_index,
        column_index: item.column_index,
        expected_raw: item.raw,
        price,
      }),
    });
    const data = await response.json() as { ok?: boolean; message?: string };
    if (!response.ok || !data.ok) throw new Error(data.message ?? `WordPress returned ${response.status}`);
  }
}
