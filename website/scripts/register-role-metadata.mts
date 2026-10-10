/**
 * ลงทะเบียน metadata schema สำหรับ Linked Roles (ทำครั้งเดียวต่อแอป)
 *
 * วิธีใช้ (จากโฟลเดอร์ website):
 *   node --env-file=.env.local scripts/register-role-metadata.mts
 *
 * ต้องมี DISCORD_TOKEN (บอท) และ DISCORD_CLIENT_ID ใน .env.local
 * ฟิลด์ metadata จะไปโผล่ให้ตั้งเงื่อนไขยศใน Discord → ตั้งค่าเซิร์ฟเวอร์ → บทบาท → ลิงก์
 */

const API = "https://discord.com/api/v10";

const token = (process.env.DISCORD_TOKEN ?? "").trim();
const clientId = (process.env.DISCORD_CLIENT_ID ?? "").trim();

if (!token || !clientId) {
  console.error("❌ ต้องมี DISCORD_TOKEN และ DISCORD_CLIENT_ID ใน .env.local");
  process.exit(1);
}

// type 7 = BOOLEAN_EQUAL — ผู้ใช้ที่เชื่อมต่อบัญชีจะได้ค่า "connected" = 1
const metadata = [
  {
    key: "connected",
    name: "เชื่อมต่อแล้ว",
    description: "บัญชีนี้เชื่อมต่อกับ Rem แล้ว",
    type: 7,
  },
];

const res = await fetch(`${API}/applications/${clientId}/role-connections/metadata`, {
  method: "PUT",
  headers: {
    authorization: `Bot ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(metadata),
});

const text = await res.text();
console.log("HTTP", res.status);

if (!res.ok) {
  console.error("❌ ลงทะเบียนไม่สำเร็จ:", text);
  process.exit(1);
}

console.log("✅ ลงทะเบียน metadata สำเร็จ — ฟิลด์ที่ใช้ได้ตอนนี้:");
console.log(text);
