/**
 * src/deploy-commands.ts
 * สคริปต์สำหรับลงทะเบียน Slash Commands กับ Discord
 * วิธีใช้:  npm run deploy
 *
 * ลงทะเบียน 2 ระดับ:
 *   1) Global  → ทุกเซิร์ฟเวอร์ที่บอทอยู่ใช้ได้ (เซิร์ฟเวอร์ใหม่อาจรอถึง ~1 ชม.)
 *   2) รายเซิร์ฟเวอร์ตาม GUILD_ID → คำสั่งขึ้นทันที (ใส่ได้หลายเซิร์ฟเวอร์ คั่นด้วย ,)
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands';
import { loadBotEnv } from './utils/env';

const env = loadBotEnv();

async function main(): Promise<void> {
  // แปลงคำสั่งทั้งหมดเป็น JSON ตามรูปแบบที่ Discord API ต้องการ
  const body = [...commands.values()].map((command) => command.data.toJSON());

  const rest = new REST().setToken(env.token);

  // ── 1) Global: ใช้ได้ทุกเซิร์ฟเวอร์ ───────────────────────────────
  console.log(`⏳ กำลังลงทะเบียน ${body.length} คำสั่งแบบ Global (ทุกเซิร์ฟเวอร์)...`);
  await rest.put(Routes.applicationCommands(env.clientId), { body });
  console.log('✅ Global สำเร็จ — ทุกเซิร์ฟเวอร์ที่บอทอยู่จะใช้คำสั่งได้ (เซิร์ฟเวอร์ใหม่อาจรอถึง 1 ชม.)');

  // ── 2) รายเซิร์ฟเวอร์: ให้คำสั่งขึ้นทันที ─────────────────────────
  for (const guildId of env.guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(env.clientId, guildId), { body });
      console.log(`✅ ลงทันทีสำหรับเซิร์ฟเวอร์ ${guildId}`);
    } catch (error) {
      console.warn(
        `⚠️ ลงที่เซิร์ฟเวอร์ ${guildId} ไม่สำเร็จ: ${error instanceof Error ? error.message : error}`,
      );
      console.warn('   (ข้ามไป — คำสั่งแบบ Global ยังใช้งานได้ปกติ)');
    }
  }
  if (env.guildIds.length > 0) {
    console.log('💡 เพิ่มเซิร์ฟเวอร์ใหม่ได้ที่ GUILD_ID ใน .env (คั่นด้วย ,) แล้วรัน npm run deploy อีกครั้ง');
  }
}

main().catch((error: unknown) => {
  console.error('❌ ลงทะเบียนคำสั่งไม่สำเร็จ:');
  console.error(error instanceof Error ? `   ${error.message}` : error);
  process.exit(1);
});
