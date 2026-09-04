import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import type { Product } from '../../core/models/product.model';
import type { PriceRule } from '../../core/models/price-rule.model';
import { ProductStoreService } from '../../core/services/product-store.service';
import { DoctorEasePriceService, DoctorEaseServicePrice } from '../../core/services/doctorease-price.service';
import { PriceHistoryEntry, SupabaseDataService } from '../../core/services/supabase-data.service';
import { PriceRuleStoreService } from '../../core/services/price-rule-store.service';
import { SAMPLE_PRODUCTS } from './data/sample-products';
import { DOCTOREASE_GROUPS, DOCTOREASE_TYPES } from './data/doctorease-options';
import { calculateAdjustedPrice } from './domain/price-calculator';

@Component({
  selector: 'app-price-control-page',
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './price-control-page.component.html',
  styleUrl: './price-control-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceControlPageComponent implements OnInit {
  readonly pageSize = 20;
  private readonly ruleStore = inject(PriceRuleStoreService);
  private readonly productStore = inject(ProductStoreService);
  private readonly doctorEase = inject(DoctorEasePriceService);
  private readonly supabase = inject(SupabaseDataService);

  readonly language = signal<'th' | 'en'>('th');
  readonly theme = signal<'light' | 'dark'>('light');

  readonly products = signal<Product[]>(this.productStore.load(SAMPLE_PRODUCTS));
  readonly query = signal('');
  readonly group = signal('ทั้งหมด');
  readonly priceStatusFilter = signal<'all' | 'different' | 'match' | 'missing' | 'pending'>('all');
  readonly page = signal(1);
  readonly open = signal(false);
  readonly productFormOpen = signal(false);
  readonly editingCode = signal<string | null>(null);
  readonly historyOpen = signal(false);
  readonly historyProduct = signal<Product | null>(null);
  readonly priceHistory = signal<PriceHistoryEntry[]>([]);
  readonly historyLoading = signal(false);
  readonly selectedCodes = signal<ReadonlySet<string>>(new Set());
  readonly doctorEasePrices = signal<ReadonlyMap<string, DoctorEaseServicePrice>>(new Map());
  readonly doctorEaseChecking = signal(false);
  readonly importMessage = signal('');
  readonly syncMessage = signal('กำลังเชื่อมต่อ Supabase...');
  readonly rules = signal<PriceRule[]>(this.ruleStore.load());

  draft: Omit<PriceRule, 'id'> = this.createEmptyDraft();
  productDraft: Product = this.createEmptyProduct();

  readonly groups = computed(() => ['ทั้งหมด', ...new Set(this.products().map((product) => product.group))]);
  readonly productGroups = computed(() => [...new Set([...DOCTOREASE_GROUPS, ...this.products().map((product) => product.group)])]);
  readonly productTypes = computed(() => [...new Set([...DOCTOREASE_TYPES, ...this.products().map((product) => product.type)])]);
  readonly filtered = computed(() => this.products().filter((product) => {
    const matchesGroup = this.group() === 'ทั้งหมด' || this.group() === product.group;
    const matchesPriceStatus = this.priceStatusFilter() === 'all' || this.doctorEaseStatus(product) === this.priceStatusFilter();
    const searchTarget = `${product.code} ${product.name}`.toLowerCase();
    return matchesGroup && matchesPriceStatus && searchTarget.includes(this.query().toLowerCase());
  }));
  readonly changed = computed(() => this.products().filter((product) => this.price(product) !== product.price));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pagedProducts = computed(() => {
    const start = (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });
  readonly pageStart = computed(() => this.filtered().length ? (this.page() - 1) * this.pageSize + 1 : 0);
  readonly pageEnd = computed(() => Math.min(this.page() * this.pageSize, this.filtered().length));
  readonly allOnPageSelected = computed(() => this.pagedProducts().length > 0 && this.pagedProducts().every((product) => this.selectedCodes().has(product.code)));

  ngOnInit(): void {
    this.restorePreferences();
    this.syncMessage.set(this.copy('กำลังเชื่อมต่อ Supabase...', 'Connecting to Supabase...'));
    void this.loadFromSupabase();
  }

  setLanguage(language: 'th' | 'en'): void {
    this.language.set(language);
    localStorage.setItem('price-control-language', language);
    document.documentElement.lang = language;
  }

  toggleTheme(): void {
    const theme = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(theme);
    localStorage.setItem('price-control-theme', theme);
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.style.colorScheme = theme;
  }

  copy(thai: string, english: string): string {
    return this.language() === 'th' ? thai : english;
  }

  setQuery(value: string): void { this.query.set(value); this.page.set(1); }

  setGroup(value: string): void { this.group.set(value); this.page.set(1); }

  setPriceStatusFilter(value: 'all' | 'different' | 'match' | 'missing' | 'pending'): void {
    this.priceStatusFilter.set(value);
    this.page.set(1);
  }

  changePage(page: number): void { this.page.set(Math.max(1, Math.min(page, this.totalPages()))); }

  async checkDoctorEasePrices(): Promise<void> {
    this.doctorEaseChecking.set(true);
    try {
      this.doctorEasePrices.set(await this.doctorEase.loadPrices());
      const mismatches = this.products().filter((product) => {
        const remote = this.doctorEasePrices().get(product.code.toLowerCase());
        return remote && remote.price !== product.price;
      }).length;
      this.importMessage.set(this.copy(
        `ตรวจสอบ DoctorEase แล้ว: ราคาไม่ตรง ${mismatches} รายการ`,
        `DoctorEase checked: ${mismatches} price mismatches`,
      ));
    } catch {
      this.importMessage.set(this.copy(
        'ตรวจสอบราคา DoctorEase ไม่สำเร็จ กรุณาตรวจสอบ Supabase Edge Function',
        'Could not check DoctorEase prices. Check the Supabase Edge Function.',
      ));
    } finally {
      this.doctorEaseChecking.set(false);
    }
  }

  doctorEaseStatus(product: Product): 'pending' | 'match' | 'different' | 'missing' {
    if (!this.doctorEasePrices().size) return 'pending';
    const remote = this.doctorEasePrices().get(product.code.toLowerCase());
    return !remote ? 'missing' : remote.price === product.price ? 'match' : 'different';
  }

  doctorEasePrice(product: Product): number | null {
    return this.doctorEasePrices().get(product.code.toLowerCase())?.price ?? null;
  }

  toggleProductSelection(code: string): void {
    this.selectedCodes.update((selected) => {
      const next = new Set(selected);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  togglePageSelection(): void {
    this.selectedCodes.update((selected) => {
      const next = new Set(selected);
      const selectAll = !this.allOnPageSelected();
      this.pagedProducts().forEach((product) => selectAll ? next.add(product.code) : next.delete(product.code));
      return next;
    });
  }

  async deleteSelected(): Promise<void> {
    const codes = [...this.selectedCodes()];
    if (!codes.length || !confirm(this.copy(
      `ต้องการลบสินค้า ${codes.length} รายการใช่หรือไม่?`,
      `Delete ${codes.length} selected products?`,
    ))) return;
    try {
      await this.supabase.deleteProducts(codes);
      this.products.update((products) => products.filter((product) => !this.selectedCodes().has(product.code)));
      this.persistProducts();
      this.selectedCodes.set(new Set());
      this.changePage(this.page());
      this.importMessage.set(this.copy(`ลบสินค้า ${codes.length} รายการเรียบร้อย`, `Deleted ${codes.length} products`));
    } catch {
      this.importMessage.set(this.copy('ลบสินค้าไม่สำเร็จ กรุณาลองอีกครั้ง', 'Could not delete products. Please try again.'));
    }
  }

  price(product: Product): number {
    const matchingRules = this.rules().filter((rule) => rule.group === product.group);
    return calculateAdjustedPrice(product.price, matchingRules);
  }

  percent(product: Product): string {
    return ((this.price(product) / product.price - 1) * 100).toFixed(1);
  }

  async save(): Promise<void> {
    const rule = { ...this.draft, id: crypto.randomUUID() };
    this.rules.update((rules) => [...rules, rule]);
    this.persistRules();
    this.draft = this.createEmptyDraft();
    try {
      await this.supabase.upsertRule(rule);
      this.syncMessage.set(this.copy('ซิงก์ Supabase แล้ว', 'Synced with Supabase'));
    } catch {
      this.syncMessage.set(this.copy('บันทึกกฎใน Supabase ไม่สำเร็จ — เก็บไว้ในเครื่องแล้ว', 'Could not save the rule to Supabase — saved locally'));
    }
  }

  async remove(id: string): Promise<void> {
    this.rules.update((rules) => rules.filter((rule) => rule.id !== id));
    this.persistRules();
    try { await this.supabase.deleteRule(id); } catch { this.syncMessage.set(this.copy('ลบกฎใน Supabase ไม่สำเร็จ', 'Could not delete the Supabase rule')); }
  }

  async apply(): Promise<void> {
    const history = this.products().flatMap((product) => {
      const newPrice = this.price(product);
      return newPrice === product.price ? [] : [{ product_code: product.code, previous_price: product.price, new_price: newPrice, source: 'rule_apply' as const }];
    });
    this.products.update((products) => products.map((product) => ({
      ...product,
      price: this.price(product),
    })));
    this.persistProducts();
    if (await this.syncProducts('อัปเดตราคาขึ้น Supabase แล้ว')) await this.savePriceHistory(history);
  }

  openImport(input: HTMLInputElement): void { input.click(); }

  async importExcel(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
      const headerRow = rawRows.findIndex((row) => this.isProductHeader(row));
      if (headerRow < 0) throw new Error('ไม่พบหัวตารางสินค้า');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: headerRow, defval: '' });
      const parsed = rows.map((row) => this.toProduct(row)).filter((product): product is Product => product !== null);
      const imported = this.dedupeProducts(parsed);
      if (!imported.length) throw new Error('ไม่มีข้อมูล');
      const current = this.products();
      const existingCodes = new Set(current.map((product) => product.code.toLowerCase()));
      const importedCodes = new Set(imported.map((product) => product.code.toLowerCase()));
      const updated = imported.filter((product) => existingCodes.has(product.code.toLowerCase())).length;
      const added = imported.length - updated;
      const next = [...current.filter((product) => !importedCodes.has(product.code.toLowerCase())), ...imported];
      this.products.set(next);
      this.persistProducts();
      this.page.set(1);
      this.selectedCodes.set(new Set());
      const synced = await this.syncProducts();
      const duplicates = parsed.length - imported.length;
      this.importMessage.set(synced
        ? this.copy(
          `บันทึก Supabase แล้ว: เพิ่ม ${added} รายการ, แก้ไข ${updated} รายการ${duplicates ? ` (รวมรหัสซ้ำ ${duplicates} แถว โดยใช้ข้อมูลแถวล่าสุด)` : ''}`,
          `Saved to Supabase: ${added} added, ${updated} updated${duplicates ? ` (${duplicates} duplicate rows; latest row used)` : ''}`,
        )
        : this.copy('นำเข้าข้อมูลในหน้าเว็บแล้ว แต่บันทึกขึ้น Supabase ไม่สำเร็จ', 'Imported locally, but could not save to Supabase'));
    } catch {
      this.importMessage.set(this.copy(
        'นำเข้าไม่สำเร็จ: ไม่พบคอลัมน์ Code/Name/Price หรือ รหัสสินค้า/ชื่อสินค้า/ราคา',
        'Import failed: Code, Name, or Price columns were not found',
      ));
    } finally { input.value = ''; }
  }

  exportExcel(): void {
    const sheet = XLSX.utils.json_to_sheet(this.products().map((product) => ({
      'รหัสสินค้า': product.code, 'ชื่อสินค้า': product.name, 'กลุ่ม': product.group,
      'ประเภท': product.type, 'ราคา': product.price, 'ใช้งาน': product.active ? 'ใช่' : 'ไม่ใช่',
    })));
    sheet['!cols'] = [{ wch: 18 }, { wch: 42 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 12 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'สินค้า');
    XLSX.writeFile(workbook, 'รายการสินค้า.xlsx', { compression: true });
  }

  openAddProduct(): void {
    this.editingCode.set(null);
    this.productDraft = this.createEmptyProduct();
    this.productFormOpen.set(true);
  }

  editProduct(product: Product): void {
    this.editingCode.set(product.code);
    this.productDraft = { ...product };
    this.productFormOpen.set(true);
  }

  closeProductForm(): void {
    this.productFormOpen.set(false);
    this.editingCode.set(null);
  }

  async showPriceHistory(product: Product): Promise<void> {
    this.historyProduct.set(product);
    this.priceHistory.set([]);
    this.historyLoading.set(true);
    this.historyOpen.set(true);
    try {
      this.priceHistory.set(await this.supabase.loadPriceHistory(product.code));
    } catch {
      this.syncMessage.set(this.copy('ไม่สามารถอ่าน Price History จาก Supabase ได้', 'Could not load price history from Supabase'));
    } finally {
      this.historyLoading.set(false);
    }
  }

  async saveProduct(): Promise<void> {
    const product = {
      ...this.productDraft,
      code: this.productDraft.code.trim(),
      name: this.productDraft.name.trim(),
      dfPercent: this.productDraft.dfEnabled && this.productDraft.dfPercent !== null
        ? Number(this.productDraft.dfPercent)
        : null,
    };
    if (!product.code || !product.name || !product.group.trim() || !Number.isFinite(product.price) || product.price < 0
      || (product.dfEnabled && (product.dfPercent === null || !Number.isFinite(product.dfPercent) || product.dfPercent < 0 || product.dfPercent > 100))) return;
    const isEditing = this.editingCode() !== null;
    const previous = isEditing ? this.products().find((item) => item.code === this.editingCode()) : undefined;
    if (!isEditing && this.products().some((item) => item.code.toLowerCase() === product.code.toLowerCase())) {
      this.importMessage.set(this.copy(`ไม่สามารถเพิ่มได้: พบรหัสสินค้า ${product.code} แล้ว`, `Cannot add: product code ${product.code} already exists`)); return;
    }
    this.products.update((products) => isEditing
      ? products.map((item) => item.code === this.editingCode() ? product : item)
      : [...products, product]);
    this.persistProducts();
    this.page.set(this.totalPages());
    this.productDraft = this.createEmptyProduct();
    this.closeProductForm();
    this.importMessage.set(isEditing
      ? this.copy('แก้ไขสินค้าเรียบร้อย', 'Product updated')
      : this.copy('เพิ่มสินค้าเรียบร้อย', 'Product added'));
    if (await this.syncProducts() && previous && previous.price !== product.price) {
      await this.savePriceHistory([{ product_code: product.code, previous_price: previous.price, new_price: product.price, source: 'manual_edit' }]);
    }
  }

  private persistRules(): void {
    this.ruleStore.save(this.rules());
  }

  private createEmptyDraft(): Omit<PriceRule, 'id'> {
    return { name: '', group: 'Filler', mode: 'percent', value: 10 };
  }

  private persistProducts(): void {
    this.productStore.save(this.products());
  }

  private async loadFromSupabase(): Promise<void> {
    try {
      const [products, rules] = await Promise.all([this.supabase.loadProducts(), this.supabase.loadRules()]);
      if (products.length) {
        this.products.set(products);
        this.persistProducts();
      } else {
        await this.supabase.upsertProducts(this.products());
      }
      if (rules.length) {
        this.rules.set(rules);
        this.persistRules();
      }
      this.syncMessage.set(products.length
        ? this.copy('เชื่อมต่อ Supabase แล้ว', 'Connected to Supabase')
        : this.copy('เชื่อมต่อ Supabase แล้ว และย้ายข้อมูลเริ่มต้นแล้ว', 'Connected to Supabase and migrated starter data'));
    } catch {
      this.syncMessage.set(this.copy('เชื่อมต่อ Supabase ไม่สำเร็จ — ใช้ข้อมูลในเครื่องชั่วคราว', 'Could not connect to Supabase — using local data'));
    }
  }

  private async syncProducts(successMessage = this.copy('ซิงก์ Supabase แล้ว', 'Synced with Supabase')): Promise<boolean> {
    try {
      await this.supabase.upsertProducts(this.products());
      this.syncMessage.set(successMessage);
      return true;
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
      this.syncMessage.set(code === '23502' || code === '23514'
        ? this.copy('ซิงก์ Supabase ไม่สำเร็จ — กรุณารัน database/add-product-df-fields.sql ใน Supabase SQL Editor', 'Supabase sync failed — run database/add-product-df-fields.sql in the Supabase SQL Editor')
        : this.copy('ซิงก์ Supabase ไม่สำเร็จ — เก็บไว้ในเครื่องแล้ว', 'Supabase sync failed — saved locally'));
      return false;
    }
  }

  private async savePriceHistory(entries: readonly PriceHistoryEntry[]): Promise<void> {
    try {
      await this.supabase.addPriceHistory(entries);
    } catch {
      this.syncMessage.set(this.copy('บันทึกราคาแล้ว แต่เก็บ Price History ไม่สำเร็จ', 'Price saved, but price history could not be recorded'));
    }
  }

  private createEmptyProduct(): Product { return { code: '', name: '', group: 'Filler', type: 'Operatives/Lab', price: 0, active: true, dfEnabled: false, dfPercent: null }; }

  private toProduct(row: Record<string, unknown>): Product | null {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/[^a-z0-9ก-๙]/g, ''), value]));
    const value = (...keys: string[]) => keys.map((key) => normalized[key.trim().toLowerCase().replace(/[^a-z0-9ก-๙]/g, '')]).find((item) => item !== undefined && String(item).trim() !== '');
    const code = String(value('รหัสสินค้า', 'code', 'product code', 'productcode', 'service code', 'servicecode') ?? '').trim();
    const name = String(value('ชื่อสินค้า', 'name', 'product name', 'productname', 'service name', 'servicename') ?? '').trim();
    const rawPrice = value('ราคา', 'price', 'product price', 'productprice');
    const price = Number(String(rawPrice ?? '').replace(/,/g, '').replace(/฿/g, ''));
    if (!code || !name || !Number.isFinite(price) || price < 0) return null;
    const active = String(value('ใช้งาน', 'active', 'activeall', 'status', 'สถานะ') ?? 'ใช่').trim().toLowerCase();
    const rawDfEnabled = String(value('มีdf', 'have df', 'havedf', 'df enabled', 'dfenabled') ?? 'ไม่').trim().toLowerCase();
    const dfEnabled = ['ใช่', 'true', '1', 'yes', 'y'].includes(rawDfEnabled);
    const rawDfPercent = value('df', 'df percent', 'dfpercent', 'เปอร์เซ็นต์df');
    const dfPercent = Number(String(rawDfPercent ?? '').replace(/,/g, '').replace(/%/g, ''));
    return {
      code,
      name,
      group: String(value('กลุ่ม', 'group', 'category') ?? 'อื่นๆ').trim() || 'อื่นๆ',
      type: String(value('ประเภท', 'type', 'product type', 'producttype') ?? 'Operatives/Lab').trim() || 'Operatives/Lab',
      price,
      active: !['ไม่', 'ไม่ใช่', 'false', '0', 'no', 'inactive'].includes(active),
      dfEnabled,
      // "Have DF" files may not include a percentage column. The database
      // accepts 0 as the safe, explicit value until one is entered in the UI.
      dfPercent: dfEnabled && Number.isFinite(dfPercent) && dfPercent >= 0 && dfPercent <= 100 ? dfPercent : (dfEnabled ? 0 : null),
    };
  }

  private isProductHeader(row: unknown[]): boolean {
    const headers = row.map((value) => String(value).trim().toLowerCase().replace(/[^a-z0-9ก-๙]/g, ''));
    const has = (...names: string[]) => names.some((name) => headers.includes(name));
    return has('code', 'รหัสสินค้า', 'productcode', 'servicecode')
      && has('name', 'ชื่อสินค้า', 'productname', 'servicename')
      && has('price', 'ราคา', 'productprice');
  }

  private dedupeProducts(products: readonly Product[]): Product[] {
    const byCode = new Map<string, Product>();
    products.forEach((product) => byCode.set(product.code.toLowerCase(), product));
    return [...byCode.values()];
  }

  private restorePreferences(): void {
    const savedLanguage = localStorage.getItem('price-control-language');
    const language = savedLanguage === 'en' ? 'en' : 'th';
    const savedTheme = localStorage.getItem('price-control-theme');
    const preferredDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const theme = savedTheme === 'dark' || (savedTheme !== 'light' && preferredDark) ? 'dark' : 'light';
    this.language.set(language);
    this.theme.set(theme);
    document.documentElement.lang = language;
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.style.colorScheme = theme;
  }
}
