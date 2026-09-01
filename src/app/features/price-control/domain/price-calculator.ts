import type { PriceRule } from '../../../core/models/price-rule.model';

export function calculateAdjustedPrice(basePrice: number, rules: readonly PriceRule[]): number {
  return rules.reduce((price, rule) => {
    switch (rule.mode) {
      case 'percent':
        return Math.round(price * (1 + rule.value / 100));
      case 'amount':
        return price + rule.value;
      case 'fixed':
        return rule.value;
    }
  }, basePrice);
}
