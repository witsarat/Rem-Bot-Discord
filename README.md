# 🔊 Voice Log Bot

บอท Discord สำหรับ **บันทึกการเข้า-ออก-ย้ายห้องเสียง** ของสมาชิกในเซิร์ฟเวอร์
ส่งเป็นข้อความ Embed สีสวยงามไปยังห้อง `voice-logs` โดยอัตโนมัติ
เขียนด้วย **TypeScript + discord.js v14**

---

## ✨ ฟีเจอร์

| ฟีเจอร์ | รายละเอียด |
|---|---|
| 🟢 บันทึกเข้าห้องเสียง | ส่ง Embed **สีเขียว** เมื่อสมาชิกเข้าห้องเสียง |
| 🔴 บันทึกออกจากห้องเสียง | ส่ง Embed **สีแดง** เมื่อสมาชิกออกจากห้องเสียง |
| 🟡 บันทึกย้ายห้องเสียง | ส่ง Embed **สีเหลือง** เมื่อสมาชิกย้ายไปห้องอื่น |
| ⚙️ `/setup` | ผู้ดูแลเท่านั้น — สร้าง/ตั้งค่าห้อง `voice-logs` (ถ้ามีอยู่แล้วใช้ห้องเดิม) แล้วบันทึก ID ลง `config.json` แยกตามเซิร์ฟเวอร์ |
| 📖 `/help` | แสดงคู่มือ คำสั่ง และความหมายของสี — เห็นเฉพาะคนที่พิมพ์ (ephemeral) |
| 🏆 `/top` | จัดอันดับสมาชิกที่อยู่ในห้องเสียง**นานที่สุด** — เลือกช่วงเวลาได้ (ทั้งหมด/7 วัน/30 วัน) ดูรายบุคคลได้ ดึงสถิติจาก**ฐานข้อมูล** |
| 🗓️ `/weekly` | **รายงานประจำสัปดาห์อัตโนมัติ** — `/weekly set` กำหนดห้องรับรายงาน (ส่งทุกวันจันทร์ 09:00 น. เวลาไทย), `/weekly now` ส่งทดสอบ, `/weekly off` ปิด |
| 🚫 ข้ามบอท | ไม่บันทึกการเคลื่อนไหวของบอทด้วยกันเอง |
| 🔇 ข้าม mute/deafen | ปิด/เปิดไมค์ เปิด/ปิดกล้อง ไม่ถือเป็นเข้า-ออกห้อง จึงไม่ถูกบันทึก |
| 🌍 ใช้ได้ทุกเซิร์ฟเวอร์ | ลงทะเบียนคำสั่งแบบ Global — เชิญบอทเข้าเซิร์ฟเวอร์ไหนก็ใช้ `/setup` `/help` ได้ (เซิร์ฟเวอร์ใหม่รอได้ถึง ~1 ชม.) |
| 🗄️ เก็บ log ลงฐานข้อมูล | รองรับ PostgreSQL ออนไลน์ (Supabase/Neon) — ประวัติ log + ค่าห้อง log อยู่ถาวร ไม่หายเมื่อ deploy ใหม่ |

---

## 📁 โครงสร้างโปรเจกต์

```
PROJECT BOT/
├── src/
│   ├── index.ts                # จุดเริ่มต้นบอท (สร้าง client, intents, ล็อกอิน)
│   ├── deploy-commands.ts      # สคริปต์ลงทะเบียน Slash Commands (Global + รายเซิร์ฟเวอร์)
│   ├── commands/
│   │   ├── index.ts            # รวมคำสั่งทั้งหมดเป็น Collection
│   │   ├── setup.ts            # คำสั่ง /setup
│   │   ├── help.ts             # คำสั่ง /help
│   │   ├── top.ts              # คำสั่ง /top — จัดอันดับเวลาอยู่ห้องเสียง (ดึงจาก DB)
│   │   └── weekly.ts           # คำสั่ง /weekly — ตั้งค่า/ปิด/ทดสอบรายงานประจำสัปดาห์
│   ├── events/
│   │   └── voiceStateUpdate.ts # ระบบดักจับเข้า-ออก-ย้ายห้องเสียง
│   └── utils/
│       ├── config.ts           # ค่าห้อง log + ห้องรายงาน ของแต่ละเซิร์ฟเวอร์ (DB → ไฟล์สำรอง)
│       ├── db.ts               # ฐานข้อมูลออนไลน์ PostgreSQL (Supabase/Neon)
│       ├── embeds.ts           # สร้าง Embed + นิยามสี Join/Leave/Move
│       ├── voiceStats.ts       # คำนวณสถิติ/อันดับเวลาห้องเสียงจากตาราง voice_logs
│       ├── weeklyReport.ts     # ตัวส่งรายงานประจำสัปดาห์อัตโนมัติ (จันทร์ 09:00 น. ไทย)
│       ├── env.ts              # ตรวจสอบค่าใน .env ก่อนรันบอท
│       └── healthServer.ts     # HTTP server จิ๋วสำหรับ Render (เปิดพอร์ตตาม PORT)
├── .env                        # ⭐ ใส่ Token, Client ID, Guild ID ที่นี่
├── .env.example                # ตัวอย่างไฟล์ .env
├── config.json                 # เก็บ ID ห้อง log แยกตามเซิร์ฟเวอร์ (บอทเขียนเอง)
├── diagnose.js                 # สคริปต์ตรวจสุขภาพบอท (npm run diagnose)
├── website/                    # 🌐 เว็บไซต์แนะนำบอท (Next.js + Tailwind)
├── package.json
├── tsconfig.json
└── README.md
```

---

## ✅ สิ่งที่ต้องมีก่อนเริ่ม

- **Node.js 18 ขึ้นไป** (ตรวจด้วย `node -v`)
- **บัญชี Discord** และสิทธิ์สร้างบอทใน https://discord.com/developers/applications

---

## 🚀 เริ่มใช้งาน 4 ขั้นตอน

### ขั้นที่ 1 — สร้างบอท และนำค่าไปใส่ใน `.env`

1. เปิด https://discord.com/developers/applications → กด **New Application** ตั้งชื่อบอท
2. เมนู **Bot** → กด **Reset Token** → **Copy** ค่าที่ได้
3. เมนู **General Information** → คัดลอก **Application ID**
4. เปิดไฟล์ `.env` แล้วแก้ค่าดังนี้:

```env
DISCORD_TOKEN=วาง Token ที่คัดลอกมาแทนข้อความนี้
CLIENT_ID=วาง Application ID แทนข้อความนี้
# GUILD_ID: ใส่ Server ID ได้หลายเซิร์ฟเวอร์ คั่นด้วย , (ไม่ใส่ก็ได้ — ใช้โหมด Global อย่างเดียว)
GUILD_ID=GUILD_ID_HERE
```

> 💡 **GUILD_ID (ไม่บังคับ):** ปกติ**ไม่ต้องใส่เลย** — `npm run deploy` จะลงคำสั่งแบบ
> **ขึ้นทันทีให้ทุกเซิร์ฟเวอร์ที่บอทอยู่ให้อัตโนมัติ** อยู่แล้ว (+ ลงแบบ Global เผื่อไว้)
> ถ้าต้องการลงให้ Server ID อื่นเพิ่มเติมเป็นพิเศษ ใส่ได้หลายตัว คั่นด้วย `,`
> (หา Server ID: เปิด Developer Mode ใน Discord → คลิกขวาที่ชื่อเซิร์ฟเวอร์ → Copy Server ID)

> ⚠️ **ห้าม commit ไฟล์ `.env` ขึ้น Git เด็ดขาด** (มี `.gitignore` กันไว้ให้แล้ว)

### ขั้นที่ 2 — ติดตั้งแพ็กเกจ

```bash
npm install
```

แพ็กเกจที่ใช้: `discord.js` (v14), `dotenv` — และ dev tools: `typescript`, `tsx`, `@types/node`

### ขั้นที่ 3 — ลงทะเบียน Slash Commands

```bash
npm run deploy
```

> คำสั่งนี้ลงทะเบียน **Global** + **แบบขึ้นทันทีให้ทุกเซิร์ฟเวอร์ที่บอทอยู่ (อัตโนมัติ)** พร้อมกัน — เพิ่มดิสใหม่แค่เชิญบอทแล้วรันคำสั่งนี้อีกครั้ง

### ขั้นที่ 4 — เชิญบอทเข้าเซิร์ฟเวอร์ แล้วเปิดบอท

ลิงก์เชิญ (แทน `<CLIENT_ID>` ด้วย Client ID ของคุณ):

```
https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&permissions=19472&scope=bot%20applications.commands
```

> `permissions=19472` = ดูช่อง (View Channels) + ส่งข้อความ (Send Messages) +
> ฝังลิงก์ (Embed Links) + จัดการช่อง (Manage Channels — ใช้สร้างห้อง `voice-logs`)
>
> 🌍 ใช้ลิงก์เดียวกันนี้เชิญบอทเข้า**เซิร์ฟเวอร์อื่น**ได้ด้วย — สมาชิกในเซิร์ฟเวอร์นั้นจะใช้คำสั่งได้เลย
> (คำสั่ง Global อาจรอถึง ~1 ชม. หรือเพิ่ม Server ID ใน `GUILD_ID` แล้วรัน `npm run deploy` เพื่อให้ขึ้นทันที)

รันบอท (โหมดพัฒนา — แก้โค้ดแล้วรีสตาร์ทอัตโนมัติ):

```bash
npm run dev
```

---

## 🎮 วิธีใช้งานในเซิร์ฟเวอร์

1. ผู้ดูแลพิมพ์ `/setup` → บอทจะสร้างห้อง `#voice-logs` และบันทึกค่าไว้ (ฐานข้อมูลออนไลน์ หรือ `config.json` สำรอง)
   (แยกตามเซิร์ฟเวอร์ — เซิร์ฟเวอร์อื่นที่บอทอยู่ก็รัน `/setup` ของตัวเองได้เช่นกัน)
2. ลองเข้า / ออก / ย้ายห้องเสียง → บอทจะส่ง log อัตโนมัติ:

| เหตุการณ์ | สี | ตัวอย่างข้อความ |
|---|---|---|
| เข้าห้องเสียง (Join) | 🟢 เขียว | "เข้าห้องเสียง (Join)" |
| ออกจากห้องเสียง (Leave) | 🔴 แดง | "ออกจากห้องเสียง (Leave)" |
| ย้ายห้องเสียง (Move) | 🟡 เหลือง | "ย้ายห้องเสียง (Move)" พร้อมระบุจากห้อง → ไปห้อง |

3. พิมพ์ `/top` → 🏆 ดู**อันดับสมาชิกที่อยู่ในห้องเสียงนานที่สุด** (ทั้งหมด / 7 วัน / 30 วัน หรือระบุรายคน)
4. ผู้ดูแลพิมพ์ `/weekly set` แล้วเลือกห้อง → บอทจะส่ง**รายงานสรุปประจำสัปดาห์**เข้าห้องนั้น**ทุกวันจันทร์ 09:00 น. (เวลาไทย)**
   - `/weekly now` = ส่งรายงานเดี๋ยวนี้ (ลองทดสอบ) • `/weekly off` = ปิดรายงาน
5. พิมพ์ `/help` เพื่อดูคู่มือได้ทุกเมื่อ (เห็นเฉพาะผู้ที่พิมพ์เท่านั้น)

---

## 🛠 สคริปต์ทั้งหมด

| คำสั่ง | ทำอะไร |
|---|---|
| `npm install` | ติดตั้งแพ็กเกจทั้งหมด |
| `npm run dev` | รันบอทโหมดพัฒนา (auto-restart เมื่อแก้โค้ด) |
| `npm start` | รันบอทปกติ (ไม่ watch) |
| `npm run deploy` | ลงทะเบียน Slash Commands — Global + ขึ้นทันทีให้ทุกเซิร์ฟเวอร์ที่บอทอยู่ (รันซ้ำเมื่อแก้คำสั่ง/เพิ่มดิส) |
| `npm run diagnose` | ตรวจสุขภาพบอท: token ใช้ได้ไหม, คำสั่งลงไว้กี่คำสั่ง, บอทอยู่เซิร์ฟเวอร์ไหน |
| `npm run build` | คอมไพล์ TypeScript → โฟลเดอร์ `dist/` |
| `npm run start:prod` | รันบอทจากโค้ดที่ build แล้ว (production) |

---

## 🌐 เว็บไซต์แนะนำบอท (`website/`)

เว็บโชว์ฟีเจอร์บอทหน้าเดียว — Next.js 16 + Tailwind CSS 4 ธีมสี Rem

🌍 **เปิดใช้งานจริงแล้ว: https://rem-bot.vercel.app (Vercel)**

```bash
cd website
npm install
npm run dev   # เปิดที่ http://localhost:3000
```

- ปุ่ม "เชิญ Rem เข้าเซิร์ฟเวอร์" ใช้ลิงก์เชิญจริงของบอท — แก้ได้ที่ตัวแปร `INVITE_URL` ใน `website/src/app/page.tsx`
- Deploy ซ้ำเมื่อแก้เว็บ: `cd website && npx vercel deploy --prod --yes`

---

## 🗄️ ฐานข้อมูลออนไลน์ (ไม่บังคับ — ให้ข้อมูลอยู่ถาวร)

บอทรองรับการเก็บ **ค่าห้อง log ของแต่ละเซิร์ฟเวอร์** และ **ประวัติ voice log ทุกเหตุการณ์**
ลงฐานข้อมูล PostgreSQL ออนไลน์ (เช่น [Supabase](https://supabase.com) — ฟรี)
โดยตั้งค่าแค่ `DATABASE_URL` — บอทจะสร้างตาราง `guild_settings` + `voice_logs` ให้อัตโนมัติ

**วิธีตั้งค่า (Supabase):**

1. สมัคร/เข้าสู่ระบบ [supabase.com](https://supabase.com) → **New project**
   (ตั้งรหัสผ่านฐานข้อมูล, Region: **Southeast Asia (Singapore)**)
2. รอสร้างเสร็จ → กดปุ่ม **Connect** → เลือก **Connection pooling → Transaction** → Copy URI
   > ⚠️ **อย่าใช้ Direct connection** — เป็น IPv6 ซึ่ง Render เชื่อมต่อไม่ได้ ให้ใช้ pooler เท่านั้น
3. เอา URI ไปใส่ 2 ที่:
   - **บน Render:** Service → **Environment** → Add Environment Variable → ชื่อ `DATABASE_URL` → Save (Render จะ redeploy ให้เอง)
   - **ในเครื่อง (สำหรับรัน/ทดสอบ local):** เพิ่มบรรทัด `DATABASE_URL=...` ใน `.env`
     (ถ้าในสตริงมี `[YOUR-PASSWORD]` ให้แทนด้วยรหัสผ่านจริง)
4. หลังบอทเริ่มใหม่ → รัน `/setup` ในดิสได้เลย — ข้อมูลจะอยู่ใน DB
   **รันครั้งเดียวใช้ได้ตลอด แม้ deploy ใหม่กี่ครั้งก็ไม่หาย**

> 💡 ถ้าไม่ตั้ง `DATABASE_URL` บอทจะทำงานแบบเดิม (เก็บลงไฟล์ `config.json`) — ไม่พัง
> 💡 เมื่อเปิด DB: คำสั่ง `/top` และระบบรายงานประจำสัปดาห์ `/weekly` จะพร้อมใช้ — สถิติทั้งหมดคำนวณจากตาราง `voice_logs` จริง
> 💡 อยากดูประวัติ log สวย ๆ: เข้าหน้า Supabase → **Table Editor** → ตาราง `voice_logs`

---

## ☁️ Deploy บอทขึ้น Render (ออนไลน์ 24/7)

โปรเจกต์นี้รองรับการรันบน [Render](https://render.com) เป็น **Web Service** ได้ทันที
(มี health server ในตัว เปิดพอร์ตตาม `PORT` ที่ Render ตั้งให้อัตโนมัติ)

1. สร้าง **Web Service** → เชื่อม repo นี้ (Root Directory: `.`)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
2. ใส่ **Environment Variables**: `DISCORD_TOKEN`, `CLIENT_ID` (และ `GUILD_ID` ถ้าต้องการ)
3. กด Deploy — รอสักครู่แล้วบอทจะออนไลน์

> ⚠️ **ข้อควรรู้เมื่อรันบน Render**
> - **Free tier จะ sleep** เมื่อไม่มีคนเข้า ~15 นาที → บอทจะออฟไลน์ชั่วคราวจนมี request เข้า
>   แก้ได้โดยใช้บริการ ping ฟรี (เช่น UptimeRobot, cron-job.org) ยิงไปที่ `https://<ชื่อ-service>.onrender.com` ทุก 5–10 นาที
> - โฟลเดอร์ของ Render เป็นแบบชั่วคราว — `config.json` (ผลจาก `/setup`) จะรีเซ็ตทุกครั้งที่ deploy ใหม่ → **แนะนำเปิดใช้ฐานข้อมูลออนไลน์ (หัวข้อ 🗄️ ด้านบน) ข้อมูลจะอยู่ถาวร** หรือถ้าไม่ใช้ DB ให้รัน `/setup` อีกครั้งหลัง deploy
> - ให้รันบอท **ครั้งละหนึ่งตัวเท่านั้น** (ถ้ารันบน Render อยู่ อย่าเปิด `npm run dev` ที่เครื่องพร้อมกัน)

---

## ⚙️ ไฟล์ `config.json`

บอทจะเขียนไฟล์นี้ให้อัตโนมัติเมื่อรัน `/setup` (แยกตาม Guild/Server):

```json
{
  "guilds": {
    "123456789012345678": {
      "logChannelId": "987654321098765432",
      "updatedAt": "2026-10-06T13:35:29.167Z"
    }
  }
}
```

- `guilds.<guildId>.logChannelId` — ID ของห้อง `voice-logs` ของเซิร์ฟเวอร์นั้น
- ถ้าเซิร์ฟเวอร์ไหนยังไม่เคยรัน `/setup` บอทจะข้ามการบันทึก log ของเซิร์ฟเวอร์นั้น
- ไฟล์นี้อยู่ใน `.gitignore` — แต่ละเครื่องมีค่าของตัวเอง และบอทจะสร้างไฟล์ใหม่ให้อัตโนมัติถ้าไม่มี
- ถ้าเปิดใช้ฐานข้อมูลออนไลน์ (`DATABASE_URL`) ค่าห้องจะถูกเก็บใน DB แทน — ไฟล์นี้จะถูกใช้เฉพาะโหมดสำรอง

---

## 🔐 สิทธิ์และ Intents ที่บอทใช้

- **Bot Permissions:** View Channels, Send Messages, Embed Links, Manage Channels
- **Intents:** `Guilds` + `GuildVoiceStates` (ไม่ต้องเปิด Privileged Intents ใดๆ ในหน้า Developer Portal)

---

## ❓ แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| `❌ ยังไม่ได้ตั้งค่า DISCORD_TOKEN...` | เปิด `.env` แล้วแทนค่า `DISCORD_TOKEN_HERE` / `CLIENT_ID_HERE` ด้วยค่าจริง (อาจต้องปิด-เปิดบอทใหม่เพราะค่า .env โหลดตอนเริ่มรัน) |
| พิมพ์ `/setup` `/help` แล้วคำสั่งไม่ขึ้น | 1) รัน `npm run deploy` แล้วหรือยัง 2) ถ้ายังไม่ขึ้นทันที ให้กด Ctrl+R ที่ตัว Discord 3) เช็คว่าเชิญบอทด้วย scope `applications.commands` (ถ้าไม่แน่ใจให้ใช้ลิงก์เชิญใน README) |
| อยากให้เซิร์ฟเวอร์อื่นใช้บอทด้วย | เชิญบอทเข้าเซิร์ฟเวอร์นั้น (ใช้ลิงก์เชิญเดียวกัน) — คำสั่งแบบ Global พร้อมใช้ให้อยู่แล้ว ถ้าไม่ขึ้นทันทีให้เพิ่ม Server ID ใน `GUILD_ID` แล้วรัน `npm run deploy` |
| ขึ้น `Missing Access` ตอน `npm run deploy` | `GUILD_ID` ชี้ไปเซิร์ฟเวอร์ที่บอทไม่ได้อยู่ → เชิญบอทเข้าเซิร์ฟเวอร์นั้น หรือแก้ `GUILD_ID` ให้ตรง (ดูรายชื่อเซิร์ฟเวอร์ที่บอทอยู่ได้จาก `npm run diagnose`) |
| บอทออนไลน์แต่ไม่มีข้อความ log | ตรวจว่าในเซิร์ฟเวอร์นั้นรัน `/setup` แล้ว และบอทมีสิทธิ์ ส่งข้อความ + ฝังลิงก์ ในห้อง `voice-logs` |
| `/setup` สร้างห้องไม่ได้ | ให้สิทธิ์ **Manage Channels** กับบอท แล้วลองใหม่ |
| `/top` หรือ `/weekly` แจ้งว่าฐานข้อมูลยังไม่พร้อม | ยังเชื่อมต่อ DB ไม่สำเร็จ — ตรวจค่า `DATABASE_URL` (ดูหัวข้อ 🗄️) แล้วรอ redeploy |
| อยากรันแบบ production | `npm run build` แล้ว `npm run start:prod` |

---

## 🧩 ภาพรวมการทำงานของโค้ด

- `src/index.ts` — สร้าง Client ด้วย intents `Guilds` + `GuildVoiceStates`,
  โหลดคำสั่งจาก `commands/`, รับอีเวนต์ `voiceStateUpdate` จาก `events/voiceStateUpdate.ts`, แล้วล็อกอินด้วย token จาก `.env`
- `src/deploy-commands.ts` — ลงทะเบียนคำสั่ง 2 ระดับ: Global + รายเซิร์ฟเวอร์ให้**ทุกดิสที่บอทอยู่** (ขึ้นทันที; `GUILD_ID` = ตัวเลือกเสริม)
- `src/events/voiceStateUpdate.ts` — หัวใจของบอท: แยกเหตุการณ์ Join / Leave / Move
  (ข้ามบอท ข้าม mute/deafen) → หา channel ID ของห้อง log จาก `config.json` → ส่ง Embed
- `src/utils/embeds.ts` — นิยามสี 🟢 `#57F287` / 🔴 `#ED4245` / 🟡 `#FEE75C` และฟังก์ชันสร้าง Embed ทั้ง 3 แบบ
- `src/utils/config.ts` — อ่าน/เขียนค่าห้อง (ห้อง log + ห้องรายงาน) แยกตาม Guild — ใช้ DB ก่อน, มีไฟล์สำรอง
- `src/utils/voiceStats.ts` — คำนวณเวลารวม/อันดับเวลาห้องเสียงจาก `voice_logs` (ใช้ร่วมกันโดย `/top` และรายงานประจำสัปดาห์)
- `src/utils/weeklyReport.ts` — ตรวจกำหนดการ + ส่งรายงานประจำสัปดาห์อัตโนมัติ (จันทร์ 09:00 น. ไทย; กันส่งซ้ำด้วยเวลาที่บันทึกใน DB)
- `src/utils/env.ts` — ตรวจ `.env` ก่อนเริ่มทำงาน ถ้าไม่ได้ตั้งค่าจะแจ้งเตือนแล้วปิดโปรแกรมทันที

---

พัฒนาด้วย [discord.js v14](https://discord.js.org/) • TypeScript • Node.js
