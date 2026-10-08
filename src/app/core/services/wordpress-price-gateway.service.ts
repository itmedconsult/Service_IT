import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface PriceUpdate {
  code: string;
  price: number;
}

interface BulkResult {
  code: string;
  ok: boolean;
  message?: string;
}

interface BulkResponse {
  ok: boolean;
  results: BulkResult[];
}

@Injectable({ providedIn: 'root' })
export class WordPressPriceGatewayService {
  async updatePrices(updates: readonly PriceUpdate[], accessToken: string): Promise<void> {
    for (let offset = 0; offset < updates.length; offset += 100) {
      const batch = updates.slice(offset, offset + 100);
      const response = await fetch(
        `${environment.wordpressBaseUrl}/wp-json/medconsult-price-sync/v1/bulk-prices`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ items: batch }),
        },
      );

      const payload = await this.readPayload(response);
      const failed = payload.results?.filter((result) => !result.ok) ?? [];
      if (!response.ok || failed.length > 0) {
        const detail = failed.map((result) => `${result.code}: ${result.message ?? 'ไม่สำเร็จ'}`).join(', ');
        throw new Error(detail || `WordPress ตอบกลับด้วยสถานะ ${response.status}`);
      }
    }
  }

  private async readPayload(response: Response): Promise<BulkResponse> {
    try {
      return await response.json() as BulkResponse;
    } catch {
      return { ok: false, results: [] };
    }
  }
}
