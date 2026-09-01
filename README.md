# DoctorEase Price Control

เว็บแอปสำหรับตรวจสอบรายการสินค้า ตั้งกฎราคา และส่งราคาใหม่กลับไปยัง DoctorEase

## เริ่มใช้งาน

1. คัดลอก `.env.example` เป็น `.env`
2. ใส่ `DOCTOREASE_API_KEY` ใน `.env` (ห้ามนำ key ไปใส่ใน `VITE_*` หรือ commit)
3. ยืนยัน endpoint สำหรับอ่านรายการและบันทึกราคาจากเอกสาร API ของ DoctorEase แล้วแก้ `DOCTOREASE_PRODUCTS_PATH` และ `DOCTOREASE_PRICE_UPDATE_PATH`
4. เปิดสอง terminal:

```sh
npm run server
npm run dev
```

ระบบหน้าเว็บจะรีเฟรชข้อมูลทุก 30 วินาที (แก้ได้ที่ `VITE_REFRESH_SECONDS`) และเมื่อกดบันทึก จะส่ง `PUT /api/products/:code/price` ผ่าน proxy โดยมี JSON `{ "price": 1234 }`.

## จุดที่ต้องยืนยันกับ API

หน้า `List_Heal` เป็นหน้าจอรายการ ไม่ใช่เอกสาร endpoint API จึงยังไม่ควรเดารูปแบบคำขอสำหรับเขียนข้อมูลจริง. Proxy รองรับการกำหนด path จาก `.env` แล้ว; หาก API ใช้ header, method หรือ payload ต่างจากตัวอย่าง ให้ปรับเฉพาะ `server.mjs` โดย API key ยังคงอยู่ฝั่งเซิร์ฟเวอร์.
