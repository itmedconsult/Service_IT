# DoctorEase Price Control

เว็บแอป Angular สำหรับดูสินค้าจริงจาก Supabase สร้างกฎปรับราคา และส่งราคาที่อนุมัติผ่าน WordPress Price Sync gateway เพื่ออัปเดตทั้ง `public.products` และ ACF `service_product` ในคำขอเดียว

## เริ่มใช้งานในเครื่อง

```sh
npm install
npm start
```

เปิด `http://localhost:4200` รายการสินค้าสามารถดูได้โดยไม่ต้องล็อกอิน ส่วนการยืนยันราคาต้องล็อกอิน Supabase ด้วยบัญชีที่มี `app_metadata.role` เป็น `admin` หรือ `price_admin`

ค่าปลายทางสาธารณะอยู่ใน `src/environments/environment.ts`:

- Supabase project URL
- Supabase publishable key ซึ่งใช้ร่วมกับ RLS
- WordPress base URL

ห้ามนำ Supabase secret key หรือ `service_role` มาใส่ใน frontend

## เส้นทางการอัปเดตราคา

1. เว็บแอปโหลด `products` จาก Supabase
2. Admin สร้างกฎราคาและกดยืนยัน
3. เว็บแอปส่ง Supabase access token ไปยัง WordPress REST API
4. ปลั๊กอินตรวจ token และ role จาก `app_metadata`
5. ปลั๊กอินอัปเดต Supabase ภายใต้ RLS แล้ว mirror ราคาไปยัง WordPress/ACF
6. เว็บแอปโหลดข้อมูลใหม่และแสดงผลสำเร็จ

รายละเอียด endpoint และตัวอย่างเรียกใช้อยู่ใน `docs/WORDPRESS_PRICE_SYNC.md`

## ตรวจสอบ

```sh
npm test
npm run build
```
