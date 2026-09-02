export interface Product {
  code: string;
  name: string;
  group: string;
  type: string;
  price: number;
  active: boolean;
  dfEnabled: boolean;
  dfPercent: number | null;
}
