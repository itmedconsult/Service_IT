import { CommonModule, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Product } from '../../core/models/product.model';
import type { PriceRule } from '../../core/models/price-rule.model';
import { PriceRuleStoreService } from '../../core/services/price-rule-store.service';
import { SAMPLE_PRODUCTS } from './data/sample-products';
import { calculateAdjustedPrice } from './domain/price-calculator';

@Component({
  selector: 'app-price-control-page',
  imports: [CommonModule, FormsModule, CurrencyPipe],
  templateUrl: './price-control-page.component.html',
  styleUrl: './price-control-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceControlPageComponent {
  private readonly ruleStore = inject(PriceRuleStoreService);

  readonly products = signal<Product[]>([...SAMPLE_PRODUCTS]);
  readonly query = signal('');
  readonly group = signal('ทั้งหมด');
  readonly open = signal(false);
  readonly rules = signal<PriceRule[]>(this.ruleStore.load());

  draft: Omit<PriceRule, 'id'> = this.createEmptyDraft();

  readonly groups = computed(() => ['ทั้งหมด', ...new Set(this.products().map((product) => product.group))]);
  readonly filtered = computed(() => this.products().filter((product) => {
    const matchesGroup = this.group() === 'ทั้งหมด' || this.group() === product.group;
    const searchTarget = `${product.code} ${product.name}`.toLowerCase();
    return matchesGroup && searchTarget.includes(this.query().toLowerCase());
  }));
  readonly changed = computed(() => this.products().filter((product) => this.price(product) !== product.price));

  price(product: Product): number {
    const matchingRules = this.rules().filter((rule) => rule.group === product.group);
    return calculateAdjustedPrice(product.price, matchingRules);
  }

  percent(product: Product): string {
    return ((this.price(product) / product.price - 1) * 100).toFixed(1);
  }

  save(): void {
    this.rules.update((rules) => [...rules, { ...this.draft, id: crypto.randomUUID() }]);
    this.persistRules();
    this.draft = this.createEmptyDraft();
  }

  remove(id: string): void {
    this.rules.update((rules) => rules.filter((rule) => rule.id !== id));
    this.persistRules();
  }

  apply(): void {
    this.products.update((products) => products.map((product) => ({
      ...product,
      price: this.price(product),
    })));
  }

  private persistRules(): void {
    this.ruleStore.save(this.rules());
  }

  private createEmptyDraft(): Omit<PriceRule, 'id'> {
    return { name: '', group: 'Filler', mode: 'percent', value: 10 };
  }
}
