# DoctorEase Price Control

เว็บแอปสำหรับดูรายการสินค้า ตั้งกฎปรับราคา และส่งราคาใหม่กลับไปยัง DoctorEase อย่างปลอดภัย

## เทคโนโลยี

- **Frontend:** Angular (Standalone Components)
- **Backend ในอนาคต:** Supabase Edge Functions
- **Database / Realtime / Auth ในอนาคต:** Supabase
- **Hosting frontend:** Hostinger Shared Hosting
- **ระบบต้นทางสินค้าและราคาจริง:** DoctorEase API

## หลักการข้อมูล

- DoctorEase เป็นแหล่งข้อมูลหลักของสินค้าและราคาจริง
- Supabase จะเก็บข้อมูลสำเนาสำหรับค้นหา, ตั้งกฎราคา, Realtime และประวัติการเปลี่ยนแปลง
- Angular จะไม่เก็บ DoctorEase API key
- Supabase Edge Function จะเก็บ API key เป็น Secret และเป็นผู้เรียก DoctorEase API

## สถานะปัจจุบัน

- ย้ายหน้าเว็บเป็น Angular แล้ว
- มีรายการสินค้าตัวอย่าง, ค้นหา, กรองกลุ่มสินค้า และกฎปรับราคา
- กฎราคาระหว่างพัฒนาถูกเก็บใน Local Storage ของ browser
- ยังไม่เชื่อม Supabase และ DoctorEase API

## วิธีรันในเครื่อง (CMD)

```cmd
cd /d C:\Service_IT
npm install
npm start
```

เปิด `http://localhost:4200`

## Deploy Hostinger ภายหลัง

```cmd
npm run build
```

อัปโหลดไฟล์ใน `dist\doctorease-price-control\browser\` ไปยัง `public_html` ของ Hostinger

## ขั้นถัดไป

1. สร้าง Supabase project และตั้งค่า Auth/RLS
2. สร้างตารางสินค้า, กฎราคา และประวัติการปรับราคา
3. สร้าง Edge Function สำหรับ sync และอัปเดตราคา DoctorEase
4. เชื่อม Angular กับ Supabase Realtime
5. ทดสอบก่อน deploy ขึ้น Hostinger
