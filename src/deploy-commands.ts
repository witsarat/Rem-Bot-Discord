/**
 * src/deploy-commands.ts
 * สคริปต์สำหรับลงทะเบียน Slash Commands กับ Discord
 * วิธีใช้:  npm run deploy
 *
 * หลักการทำงาน:
 *   1) ล้างคำสั่งระดับ Global ที่เคยลงไว้ทิ้ง — เพราะถ้ามีคำสั่งชื่อเดียวกัน
 *      ทั้งแบบ Global และแบบรายเซิร์ฟเวอร์ Discord จะโชว์คำสั่งซ้ำ 2 อัน (ปัญหาที่เจอจริง)
 *   2) ลงคำสั่งแบบ "รายเซิร์ฟเวอร์" ให้ทุกดิสที่บอทอยู่ → คำสั่งขึ้นทันที ไม่ต้องรอ
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

  // ── 1) ล้างคำสั่งระดับ Global (กันคำสั่งซ้ำซ้อนกับแบบรายเซิร์ฟเวอร์) ──
  console.log('⏳ ล้างคำสั่งระดับ Global ที่เคยลงไว้ (ถ้ามี)...');
  await rest.put(Routes.applicationCommands(env.clientId), { body: [] });
  console.log('✅ ล้าง Global แล้ว — ใช้คำสั่งแบบรายเซิร์ฟเวอร์อย่างเดียว (ขึ้นทันทีทุกดิส)');

  // ── 2) ลงคำสั่งแบบรายเซิร์ฟเวอร์ให้ทุกดิสที่บอทอยู่ (+ GUILD_ID เสริม ถ้ามี) ──
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
    console.log('⚠️ ไม่พบเซิร์ฟเวอร์ให้ลงคำสั่ง — เชิญบอทเข้าเซิร์ฟเวอร์ก่อน แล้วรัน npm run deploy อีกครั้ง');
    return;
  }

  for (const [guildId, name] of targets) {
    const label = name ? `${name} (${guildId})` : guildId;
    try {
      await rest.put(Routes.applicationGuildCommands(env.clientId, guildId), { body });
      console.log(`✅ ลงทันทีสำหรับ: ${label}`);
    } catch (error) {
      console.warn(`⚠️ ลงที่ ${label} ไม่สำเร็จ: ${error instanceof Error ? error.message : error}`);
      console.warn('   (ข้ามไป — ลองรัน npm run deploy อีกครั้ง)');
    }
  }

  console.log('💡 เพิ่มดิสใหม่: เชิญบอทเข้าไป แล้วรัน npm run deploy อีกครั้ง — ระบบลงให้อัตโนมัติ');
}

main().catch((error: unknown) => {
  console.error('❌ ลงทะเบียนคำสั่งไม่สำเร็จ:');
  console.error(error instanceof Error ? `   ${error.message}` : error);
  process.exit(1);
});
