/**
 * src/index.ts — จุดเริ่มต้นของบอท
 * ขั้นตอน: ตรวจ .env → สร้าง Client → ลงทะเบียนอีเวนต์/คำสั่ง → ล็อกอิน
 */
import 'dotenv/config';
import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { commands } from './commands';
import { registerVoiceStateUpdate } from './events/voiceStateUpdate';
import { loadBotEnv } from './utils/env';
import { startHealthServer } from './utils/healthServer';

// ────────────────────────────────────────────────
// 1) ตรวจสอบค่าใน .env (Token / Client ID)
// ────────────────────────────────────────────────
const env = loadBotEnv();

// ────────────────────────────────────────────────
// 1.5) เปิด HTTP health server สำหรับ Render (ทำงานเฉพาะเมื่อมีตัวแปร PORT)
//      Render Web Service ต้องให้แอปเปิดพอร์ต ไม่งั้นจะขึ้น "No open ports detected"
// ────────────────────────────────────────────────
startHealthServer();

// ────────────────────────────────────────────────
// 2) สร้าง Client พร้อม Intents ที่จำเป็น
//    - Guilds           → ข้อมูลเซิร์ฟเวอร์ทั่วไป
//    - GuildVoiceStates → อีเวนต์เข้า-ออก-ย้ายห้องเสียง (จำเป็นมาก!)
// ────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// ────────────────────────────────────────────────
// 3) ลงทะเบียนระบบ Voice Log
// ────────────────────────────────────────────────
registerVoiceStateUpdate(client);

// 3.1) จัดการ Slash Commands (/setup, /help)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[คำสั่ง /${interaction.commandName}] เกิดข้อผิดพลาด:`, error);
    const content = '❌ เกิดข้อผิดพลาดในการทำงานของคำสั่งนี้ กรุณาลองใหม่อีกครั้ง';
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content });
      } else if (interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch {
      // ถ้าตอบกลับไม่ได้ก็ปล่อยผ่าน
    }
  }
});

// 3.2) แจ้งเตือนเมื่อบอทออนไลน์สำเร็จ
client.once(Events.ClientReady, (readyClient) => {
  console.log('──────────────────────────────────────────');
  console.log(`✅ บอทออนไลน์แล้ว: ${readyClient.user.username}`);
  console.log(`📌 อยู่ในเซิร์ฟเวอร์: ${readyClient.guilds.cache.size} แห่ง`);
  console.log('💡 ถ้าคำสั่ง /setup /help ยังไม่ขึ้น ให้รัน: npm run deploy');
  console.log('──────────────────────────────────────────');

  // ตั้งค่าสถานะการเล่นให้ดูสวยงาม (ไม่บังคับ)
  readyClient.user.setPresence({
    activities: [{ name: 'บันทึก Voice Log 🔊', type: ActivityType.Watching }],
    status: 'online',
  });
});

// ────────────────────────────────────────────────
// 4) ล็อกอินเข้าสู่ Discord
// ────────────────────────────────────────────────
client.login(env.token).catch((error: unknown) => {
  console.error('❌ ล็อกอินไม่สำเร็จ! กรุณาตรวจสอบ DISCORD_TOKEN ในไฟล์ .env');
  console.error(error instanceof Error ? `   สาเหตุ: ${error.message}` : error);
  process.exit(1);
});
