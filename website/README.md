# 🌐 Rem — Voice Log Bot Website

เว็บไซต์แนะนำบอท **Rem (Discord Voice Log Bot)** — ธีมสีได้แรงบันดาลใจจากคาแรกเตอร์ Rem (Re:Zero)
ฟ้าใส (สีผม) + กรมท่าเข้ม (ชุดเมด) + ขาวลูกไม้

สร้างด้วย **Next.js 16 + TypeScript + Tailwind CSS 4**

🌍 **Live: https://rem-bot.vercel.app** — โปรเจกต์ Vercel ชื่อ `rem-bot`

## รันเว็บ

```bash
npm install
npm run dev     # เปิดที่ http://localhost:3000
```

## Build สำหรับ deploy

```bash
npm run build
npm run start   # รัน production server
```

โปรเจกต์นี้ผูกกับ Vercel แล้ว — deploy ซ้ำด้วย `npx vercel deploy --prod --yes` (หรือ deploy จากหน้าเว็บ Vercel)

## จุดที่แก้บ่อย

| อยากแก้ | ไฟล์ |
|---|---|
| ลิงก์เชิญบอท (ทุกปุ่มในเว็บ) | `src/app/page.tsx` → ตัวแปร `INVITE_URL` |
| ลิงก์ GitHub | `src/app/page.tsx` → ตัวแปร `GITHUB_URL` |
| ข้อความ/ฟีเจอร์/FAQ | `src/app/page.tsx` → อาร์เรย์ `FEATURES`, `STEPS`, `FAQS` |
| สีและธีม | `src/app/globals.css` → บล็อก `@theme` |
| ไอคอน (favicon) | `src/app/icon.svg` |
