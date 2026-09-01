export interface PriceRule {
  id: string;
  name: string;
  group: string;
  mode: 'percent' | 'amount' | 'fixed';
  value: number;
}
