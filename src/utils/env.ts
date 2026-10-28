/**
 * src/utils/env.ts
 * ตรวจสอบค่าตั้งต้นจากไฟล์ .env ก่อนที่โปรแกรมจะเริ่มทำงาน
 * ถ้ายังไม่ได้ตั้งค่า จะแจ้งเตือนเป็นภาษาไทยแล้วปิดโปรแกรมทันที
 */

export interface BotEnv {
  /** Token ของบอท (DISCORD_TOKEN) */
  token: string;
  /** Client ID / Application ID (CLIENT_ID) */
  clientId: string;
  /**
   * Guild ID ที่ต้องการให้คำสั่งขึ้นทันที (GUILD_ID)
   * ใส่ได้หลายเซิร์ฟเวอร์ คั่นด้วย , หรือเว้นวรรค เช่น "111,222"
   * ถ้าไม่ใส่ = ใช้โหมด Global อย่างเดียว (ทุกเซิร์ฟเวอร์ใช้ได้ แต่เซิร์ฟเวอร์ใหม่อาจรอ ~1 ชม.)
   */
  guildIds: string[];
  /**
   * Discord user id ของเจ้าของบอท (OWNER_ID) — ใช้เปิด/ยกเลิก Premium ให้เซิร์ฟเวอร์
   * ใส่ได้หลายคน คั่นด้วย , หรือเว้นวรรค
   */
  ownerIds: string[];
}

/** อ่านรายชื่อเจ้าของบอทจาก OWNER_ID (คั่นด้วย , หรือเว้นวรรค) */
export function getOwnerIds(): string[] {
  return (process.env.OWNER_ID ?? '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => /^\d{17,20}$/.test(id));
}

/** เช็คว่ามีการตั้งค่าจริงแล้ว (ไม่ว่าง และไม่ใช่ค่า placeholder ที่ลงท้ายด้วย _HERE) */
function isFilled(value: string | undefined): value is string {
  return !!value && !value.endsWith('_HERE');
}

/** แจ้งเตือนแล้วปิดโปรแกรม (return type เป็น never เพื่อให้ TypeScript รู้ว่าโค้ดหลังจากนี้ทำงานต่อแน่นอน) */
function fail(missingName: string): never {
  console.error('');
  console.error(`❌ ยังไม่ได้ตั้งค่า ${missingName} ในไฟล์ .env`);
  console.error('👉 เปิดไฟล์ .env แล้วแทนค่า DISCORD_TOKEN_HERE / CLIENT_ID_HERE ด้วยค่าจริงจาก');
  console.error('   https://discord.com/developers/applications');
  console.error('');
  process.exit(1);
}

/** อ่านและตรวจสอบค่าทั้งหมดที่จำเป็นจาก .env */
export function loadBotEnv(): BotEnv {
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!isFilled(token)) fail('DISCORD_TOKEN');

  const clientId = process.env.CLIENT_ID?.trim();
  if (!isFilled(clientId)) fail('CLIENT_ID');

  // GUILD_ID ใส่ได้หลายเซิร์ฟเวอร์ คั่นด้วยเครื่องหมายจุลภาคหรือช่องว่าง
  const guildIds = (process.env.GUILD_ID ?? '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => isFilled(id));

  return {
    token,
    clientId,
    guildIds,
    ownerIds: getOwnerIds(),
  };
}
