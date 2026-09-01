import { Injectable } from '@angular/core';
import type { PriceRule } from '../models/price-rule.model';

const STORAGE_KEY = 'price-rules';

@Injectable({ providedIn: 'root' })
export class PriceRuleStoreService {
  load(): PriceRule[] {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value) as PriceRule[] : [];
    } catch {
      return [];
    }
  }

  save(rules: readonly PriceRule[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }
}
