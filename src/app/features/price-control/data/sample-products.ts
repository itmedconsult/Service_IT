import type { Product } from '../../../core/models/product.model';

export const SAMPLE_PRODUCTS: readonly Product[] = [
  { code: 'ZINCN001', name: 'Zinc (N-Health)', group: 'Lab Analysis', type: 'Operatives/Lab', price: 1200, active: true },
  { code: 'ZIKAPCR001', name: 'Zika RT-PCR (NHealth)', group: 'Lab Analysis', type: 'Operatives/Lab', price: 3500, active: true },
  { code: 'YVIOFLR002', name: 'Yvoire Purple Filler (1 Bottle = 1CC)', group: 'Filler', type: 'Operatives/Lab', price: 8500, active: true },
  { code: 'YOUTHFILL002', name: 'YOUTHFILL FINE WITH LIDOCAINE', group: 'Filler', type: 'Operatives/Lab', price: 3500, active: true },
  { code: 'XRHIP001', name: 'HIP X-RAY (DYM)', group: 'X-RAY', type: 'Operatives/Lab', price: 2500, active: true },
  { code: 'XEOBTX005', name: 'Xeomin 30 Units / Areas', group: 'Botox', type: 'Operatives/Lab', price: 5199, active: true },
];
