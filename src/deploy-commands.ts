/**
 * src/deploy-commands.ts
 * สคริปต์สำหรับลงทะเบียน Slash Commands กับ Discord
 * วิธีใช้:  npm run deploy
 *
 * ลงทะเบียน 2 ระดับ:
 *   1) Global  → ทุกเซิร์ฟเวอร์ที่บอทอยู่ใช้ได้ (เซิร์ฟเวอร์ใหม่อาจรอถึง ~1 ชม.)
 *   2) รายเซิร์ฟเวอร์ → คำสั่งขึ้นทันที — ลงให้ "ทุกดิสที่บอทอยู่" อัตโนมัติ
 *      (+ ลงเพิ่มให้ Server ID ใน GUILD_ID ด้วย ถ้ามี — ไม่ต้องใส่ก็ได้)
 *
 * เพิ่มดิสใหม่ในอนาคต: แค่เชิญบอทเข้า แล้วรัน npm run deploy อีกครั้ง — จบ
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
  //    รวม "ทุกดิสที่บอทอยู่" + "Server ID ที่ระบุใน GUILD_ID" (ถ้ามี)
  const targets = new Map<string, string>(); // id → ชื่อดิส ('' = ยังไม่ทราบชื่อ)

  for (const id of env.guildIds) targets.set(id, '');

  try {
    const guilds = (await rest.get('/users/@me/guilds')) as { id: string; name: string }[];
    for (const guild of guilds) targets.set(guild.id, guild.name);
  } catch (error) {
    console.warn(
      '⚠️ ดึงรายชื่อเซิร์ฟเวอร์ของบอทไม่สำเร็จ (จะลงให้เฉพาะ GUILD_ID ที่ระบุ):',
      error instanceof Error ? error.message : error,
    );
  }

  if (targets.size === 0) {
    console.log('ℹ️ ยังไม่พบเซิร์ฟเวอร์ให้ลงแบบรายเซิร์ฟเวอร์ — ใช้ Global อย่างเดียวก็ได้ (อาจรอถึง 1 ชม.)');
    return;
  }

  for (const [guildId, name] of targets) {
    const label = name ? `${name} (${guildId})` : guildId;
    try {
      await rest.put(Routes.applicationGuildCommands(env.clientId, guildId), { body });
      console.log(`✅ ลงทันทีสำหรับ: ${label}`);
    } catch (error) {
      console.warn(`⚠️ ลงที่ ${label} ไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
      console.warn('   (ข้ามไป — คำสั่งแบบ Global ยังใช้งานได้ปกติ)');
    }
  }

  console.log('💡 เพิ่มดิสใหม่: เชิญบอทเข้าไป แล้วรัน npm run deploy อีกครั้ง — ระบบลงให้อัตโนมัติ');
}

main().catch((error: unknown) => {
  console.error('❌ ลงทะเบียนคำสั่งไม่สำเร็จ:');
  console.error(error instanceof Error ? `   ${error.message}` : error);
  process.exit(1);
});
