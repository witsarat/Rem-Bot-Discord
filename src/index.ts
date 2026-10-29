/**
 * src/index.ts — จุดเริ่มต้นของบอท
 * ขั้นตอน: ตรวจ .env → สร้าง Client → ลงทะเบียนอีเวนต์/คำสั่ง → ล็อกอิน
 */
import 'dotenv/config';
import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, Team } from 'discord.js';
import { commands } from './commands';
import { registerVoiceStateUpdate } from './events/voiceStateUpdate';
import { startWeeklyScheduler } from './utils/weeklyReport';
import { startRewardsScheduler } from './utils/rewards';
import { loadBotEnv } from './utils/env';
import { startHealthServer } from './utils/healthServer';
import { initDb, syncBotGuilds, deleteVoiceSnapshotDb } from './utils/db';
import { startVoiceSnapshotSync, scheduleGuildVoiceSync } from './utils/voicePresence';
import { syncGuildCommands, syncCommandsForGuild } from './utils/commandSync';
import { botOwnerCount, registerBotOwners } from './utils/premium';

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
// 1.6) เชื่อมต่อฐานข้อมูลออนไลน์ ถ้าตั้งค่า DATABASE_URL (สร้างตารางให้อัตโนมัติ)
//      ถ้าไม่ได้ตั้ง / เชื่อมต่อไม่ได้ → บอทจะใช้ config.json แบบเดิมแทน
// ────────────────────────────────────────────────
void initDb();

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

// 3.01) ซิงก์รายชื่อเซิร์ฟเวอร์กับ DB เมื่อบอทถูกเพิ่ม/ถูกนำออกจากดิส
//       (ตัวแปรนี้กันไม่ให้ลงคำสั่งซ้ำตอนบูต — ตอนบูต ClientReady จัดการให้แล้ว)
let initialCommandSyncDone = false;

client.on(Events.GuildCreate, (guild) => {
  void syncBotGuilds([...client.guilds.cache.keys()]);
  if (!initialCommandSyncDone) return; // ตอนบูตปล่อยให้ ClientReady ซิงก์ทั้งหมดครั้งเดียว
  // ดิสใหม่ → ลงคำสั่งให้ทันที (ไม่ต้องรอรีสตาร์ท/รัน npm run deploy)
  void syncCommandsForGuild(client, guild.id, guild.name).catch((error: unknown) => {
    console.warn('[commands] ลงคำสั่งให้ดิสใหม่ไม่สำเร็จ:', error);
  });
});
client.on(Events.GuildDelete, (guild) => {
  void syncBotGuilds([...client.guilds.cache.keys()]);
  void deleteVoiceSnapshotDb(guild.id);
});

// 3.02) ซิงก์ "ห้องเสียงปัจจุบัน" (ห้อง + คนที่อยู่ในห้อง) — อัปเดตสดตามอีเวนต์
client.on(Events.VoiceStateUpdate, (_oldState, newState) => {
  scheduleGuildVoiceSync(newState.guild);
});
client.on(Events.ChannelCreate, (channel) => {
  const guild = 'guild' in channel ? channel.guild : null;
  if (guild) scheduleGuildVoiceSync(guild);
});
client.on(Events.ChannelDelete, (channel) => {
  const guild = 'guild' in channel ? channel.guild : null;
  if (guild) scheduleGuildVoiceSync(guild);
});
client.on(Events.ChannelUpdate, (_oldChannel, newChannel) => {
  const guild = 'guild' in newChannel ? newChannel.guild : null;
  if (guild) scheduleGuildVoiceSync(guild);
});

// 3.05) ระบบรายงานประจำสัปดาห์ — ส่งอัตโนมัติทุกวันจันทร์ 09:00 น. (เวลาไทย)
startWeeklyScheduler(client);

// 3.06) Achievements + Role rewards (voice-only) — ตรวจทุก 10 นาที
startRewardsScheduler(client);

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
client.once(Events.ClientReady, async (readyClient) => {
  console.log('──────────────────────────────────────────');
  console.log(`✅ บอทออนไลน์แล้ว: ${readyClient.user.username}`);
  console.log(`📌 อยู่ในเซิร์ฟเวอร์: ${readyClient.guilds.cache.size} แห่ง`);

  // เจ้าของแอป Discord (user หรือ team) ได้สิทธิ์ /premium grant อัตโนมัติ — ไม่ต้องพึ่ง OWNER_ID
  try {
    const application = await readyClient.application?.fetch();
    const appOwner = application?.owner;
    if (appOwner) {
      if (appOwner instanceof Team) registerBotOwners([...appOwner.members.keys()]);
      else registerBotOwners([appOwner.id]);
    }
  } catch (error) {
    console.warn('[premium] ดึงข้อมูลเจ้าของแอปไม่สำเร็จ (ใช้ OWNER_ID อย่างเดียว):', error);
  }
  console.log(`👑 เจ้าของบอทที่ใช้ /premium ได้: ${botOwnerCount()} คน`);

  console.log('🧰 กำลังตรวจ/ลงทะเบียน Slash Commands ให้ทุกเซิร์ฟเวอร์...');
  console.log('──────────────────────────────────────────');

  // ลงทะเบียนคำสั่งอัตโนมัติ (แทนการรัน npm run deploy ด้วยมือ — จำเป็นบน Render)
  void syncGuildCommands(readyClient)
    .catch((error: unknown) => {
      console.warn('[commands] ซิงก์คำสั่งไม่สำเร็จ:', error);
    })
    .finally(() => {
      initialCommandSyncDone = true;
    });

  // ซิงก์รายชื่อเซิร์ฟเวอร์ที่บอทอยู่ลง DB (ให้เว็บรู้โดยไม่ต้องใช้ token)
  void syncBotGuilds([...readyClient.guilds.cache.keys()]);

  // เริ่มระบบซิงก์ "ห้องเสียงปัจจุบัน" (ซิงก์ทันที + ทวนทุก 60 วินาที)
  startVoiceSnapshotSync(readyClient);

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
