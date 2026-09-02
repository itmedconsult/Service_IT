import { Injectable } from '@angular/core';
import type { Product } from '../models/product.model';

const STORAGE_KEY = 'price-control-products';

@Injectable({ providedIn: 'root' })
export class ProductStoreService {
  load(fallback: readonly Product[]): Product[] {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      const products = value ? JSON.parse(value) : null;
      return Array.isArray(products)
        ? products.map((product) => ({
          ...product,
          dfEnabled: product.dfEnabled === true,
          dfPercent: product.dfEnabled === true && Number.isFinite(Number(product.dfPercent))
            ? Number(product.dfPercent)
            : null,
        })) as Product[]
        : [...fallback];
    } catch {
      return [...fallback];
    }
  }

  save(products: readonly Product[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }
}
