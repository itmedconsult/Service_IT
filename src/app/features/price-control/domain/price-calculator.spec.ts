import { describe, expect, it } from 'vitest';
import type { PriceRule } from '../../../core/models/price-rule.model';
import { calculateAdjustedPrice } from './price-calculator';

const basePrice = 1_000;

const rule = (mode: PriceRule['mode'], value: number): PriceRule => ({
  id: `${mode}-${value}`,
  name: 'Test rule',
  group: 'Filler',
  mode,
  value,
});

describe('calculateAdjustedPrice', () => {
  it('applies matching rules in their configured order', () => {
    expect(calculateAdjustedPrice(basePrice, [rule('percent', 10), rule('amount', 50)])).toBe(1_150);
  });

  it('returns the original price when no rules match', () => {
    expect(calculateAdjustedPrice(basePrice, [])).toBe(basePrice);
  });

  it('replaces the running price for a fixed-price rule', () => {
    expect(calculateAdjustedPrice(basePrice, [rule('percent', 10), rule('fixed', 799)])).toBe(799);
  });
});
