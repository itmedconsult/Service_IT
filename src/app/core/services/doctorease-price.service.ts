import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export interface DoctorEaseServicePrice {
  code: string;
  price: number;
  updatedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class DoctorEasePriceService {
  async loadPrices(): Promise<Map<string, DoctorEaseServicePrice>> {
    const client = createClient(environment.supabaseUrl, environment.supabasePublishableKey);
    const { data, error } = await client.functions.invoke<{ items: DoctorEaseServicePrice[] }>('doctorease-services', { method: 'GET' });
    if (error) throw error;
    return new Map((data?.items ?? []).filter((item) => item.code).map((item) => [item.code.toLowerCase(), { ...item, price: Number(item.price) }]));
  }
}
