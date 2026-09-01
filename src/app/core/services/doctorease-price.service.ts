import { Injectable } from '@angular/core';

export interface DoctorEaseServicePrice {
  code: string;
  price: number;
  updatedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class DoctorEasePriceService {
  async loadPrices(): Promise<Map<string, DoctorEaseServicePrice>> {
    const response = await fetch('/api/doctorease/services');
    if (!response.ok) throw new Error('ไม่สามารถอ่านราคาจาก DoctorEase ได้');
    const payload = await response.json() as { items: DoctorEaseServicePrice[] };
    return new Map((payload.items ?? []).filter((item) => item.code).map((item) => [item.code.toLowerCase(), { ...item, price: Number(item.price) }]));
  }
}
