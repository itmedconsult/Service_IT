import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PromotionPrice, PromotionPriceService } from '../../core/services/promotion-price.service';
import { SupabaseDataService } from '../../core/services/supabase-data.service';

@Component({
  selector: 'app-promotion-prices-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './promotion-prices-page.component.html',
  styleUrl: './promotion-prices-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionPricesPageComponent implements OnInit {
  readonly auth = inject(SupabaseDataService);
  private readonly prices = inject(PromotionPriceService);
  readonly language = signal<'th' | 'en'>('en');
  readonly items = signal<PromotionPrice[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly query = signal('');
  readonly table = signal('all');
  readonly pageUrl = signal('https://www.medconsultasia.com/promotion/');
  readonly editing = signal<PromotionPrice | null>(null);
  readonly tables = computed(() => [...new Map(this.items().map(item => [item.table_id, item.table_name])).entries()]);
  readonly visible = computed(() => this.items().filter(item =>
    (this.table() === 'all' || item.table_id === this.table()) &&
    `${item.label} ${item.table_name}`.toLowerCase().includes(this.query().toLowerCase().trim()),
  ));
  loginEmail = 'it@medconsultasia.com';
  loginPassword = '';
  draftPrice: number | null = null;

  ngOnInit(): void {
    this.setLanguage(localStorage.getItem('promotion-price-language') === 'th' ? 'th' : 'en');
    void this.reload();
  }

  copy(thai: string, english: string): string {
    return this.language() === 'th' ? thai : english;
  }

  setLanguage(language: 'th' | 'en'): void {
    this.language.set(language);
    localStorage.setItem('promotion-price-language', language);
    document.documentElement.lang = language;
    this.message.set('');
    this.error.set('');
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.prices.load();
      this.items.set(result.items);
      this.pageUrl.set(result.page_url);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.copy('โหลดราคาจาก WordPress ไม่สำเร็จ', 'Could not load prices from WordPress'));
    } finally {
      this.loading.set(false);
    }
  }

  async signIn(): Promise<void> {
    this.error.set('');
    try {
      await this.auth.signIn(this.loginEmail.trim(), this.loginPassword);
      this.loginPassword = '';
      if (!this.auth.canManagePrices()) this.error.set(this.copy('บัญชีนี้ไม่มีสิทธิ์แก้ราคา', 'This account cannot edit prices'));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.copy('เข้าสู่ระบบไม่สำเร็จ', 'Sign-in failed'));
    }
  }

  async sendMagicLink(): Promise<void> {
    this.error.set('');
    try {
      await this.auth.sendMagicLink(this.loginEmail.trim());
      this.message.set(this.copy('ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว', 'A sign-in link has been sent to your email'));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.copy('ส่งลิงก์ไม่สำเร็จ', 'Could not send the sign-in link'));
    }
  }

  startEdit(item: PromotionPrice): void {
    this.editing.set(item);
    this.draftPrice = item.price;
    this.message.set('');
    this.error.set('');
  }

  async save(): Promise<void> {
    const item = this.editing();
    const token = this.auth.session()?.access_token;
    const price = Number(this.draftPrice);
    if (!item || !token || !this.auth.canManagePrices() || this.draftPrice === null || !Number.isFinite(price) || price < 0 || price > 10000000 || Math.abs(price - Math.round(price * 100) / 100) > 0.00001) {
      this.error.set(this.copy('กรุณาเข้าสู่ระบบ Admin และใส่ราคาที่ถูกต้อง (ไม่เกิน 2 ตำแหน่งทศนิยม)', 'Sign in as an Admin and enter a valid price (up to 2 decimal places)'));
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.prices.update(item, price, token);
      await this.reload();
      const saved = this.items().find(row => row.table_id === item.table_id && row.row_index === item.row_index && row.column_index === item.column_index);
      if (!saved || Math.abs(saved.price - price) > 0.005) throw new Error(this.copy('บันทึกแล้ว แต่ราคาใน WordPress ยังไม่ตรง กรุณาตรวจสอบอีกครั้ง', 'Saved, but the price shown by WordPress does not match. Please check again.'));
      this.editing.set(null);
      this.message.set(this.copy(`อัปเดต ${item.label} เป็น ฿${price.toLocaleString('en-US')} บนเว็บไซต์แล้ว`, `Updated ${item.label} to ฿${price.toLocaleString('en-US')} on the website`));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.copy('บันทึกราคาไม่สำเร็จ', 'Could not save the price'));
    } finally {
      this.saving.set(false);
    }
  }
}
