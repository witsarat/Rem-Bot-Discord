/**
 * src/utils/weeklyReport.ts
 * รายงานประจำสัปดาห์อัตโนมัติ — สรุปสถิติห้องเสียงส่งเข้าห้องที่กำหนดไว้
 *
 * กำหนดการ: ทุกวันจันทร์ 09:00 น. เวลาไทย (UTC+7 คงที่ = จันทร์ 02:00 UTC)
 * - กันส่งซ้ำด้วยค่า last_weekly_sent_at ในฐานข้อมูล (รอดจากการรีสตาร์ทของ Render)
 * - ถ้าบอทออฟไลน์ช่วงเวลาส่ง ระบบจะส่งย้อนหลังให้เมื่อออนไลน์อีกครั้ง (รอบล่าสุดรอบเดียว)
 */
import { ChannelType, Client, EmbedBuilder } from 'discord.js';
import { getWeeklyTargets, isDbReady, markWeeklySent } from './db';
import { DAY_MS, formatVoiceDuration, getVoiceLeaderboard, VoiceLeaderboard } from './voiceStats';

const WEEK_MS = 7 * DAY_MS;
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // ตรวจกำหนดการทุก 5 นาที
const FIRST_CHECK_DELAY_MS = 20 * 1000; // ตรวจครั้งแรกหลังบอทเริ่มทำงาน 20 วินาที

const TH_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Bangkok',
});

const TH_DATETIME = new Intl.DateTimeFormat('th-TH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});

/** วันที่ไทยแบบสั้น เช่น "1 ต.ค." (เขตเวลาไทย) */
export function formatThaiDate(ms: number): string {
  return TH_DATE.format(new Date(ms));
}

/** วันเวลาไทยแบบเต็ม เช่น "วันจันทร์ 12 ตุลาคม 09:00" (เขตเวลาไทย) */
export function formatThaiDateTime(ms: number): string {
  return TH_DATETIME.format(new Date(ms));
}

/**
 * หาเวลาส่งรายงานครั้งถัดไป: "วันจันทร์ 09:00 เวลาไทย" ครั้งแรกที่อยู่หลังเวลาที่กำหนด
 * (ไทยไม่มี DST → วันจันทร์ 09:00 ไทย = วันจันทร์ 02:00 UTC เสมอ)
 */
export function nextWeeklyReportAt(fromMs: number): number {
  const from = new Date(fromMs);
  const baseUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const daysToMonday = (1 - from.getUTCDay() + 7) % 7;
  let candidate = baseUtc + daysToMonday * DAY_MS + 2 * 3_600_000; // จันทร์ 02:00 UTC
  if (candidate <= fromMs) candidate += WEEK_MS;
  return candidate;
}

/** สร้าง Embed รายงานประจำสัปดาห์จากผลสถิติ */
function buildWeeklyReportEmbed(
  guildName: string,
  board: VoiceLeaderboard,
  fromMs: number,
  toMs: number,
): EmbedBuilder {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = board.rows.slice(0, 5).map((row, index) => {
    const place = medals[index] ?? `**${index + 1}.**`;
    return `${place} **${row.username}** — ⏱️ รวม ${formatVoiceDuration(row.totalMs)} • เข้าห้อง ${row.sessions} ครั้ง`;
  });

  const summary = `👥 สมาชิกที่ใช้งาน: **${board.participants} คน** • ⏱️ เวลารวม: **${formatVoiceDuration(board.totalMs)}**`;
  const channelLine = board.topChannel
    ? `\n🔊 ห้องยอดนิยม: **${board.topChannel.name}** (${board.topChannel.count} ครั้ง)`
    : '';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 รายงานประจำสัปดาห์ — การใช้งานห้องเสียง')
    .setDescription(
      [
        `📅 สรุปสถิติ 7 วันล่าสุด (${formatThaiDate(fromMs)} – ${formatThaiDate(toMs)})`,
        '',
        ...(lines.length ? lines : ['— ยังไม่มีข้อมูลการใช้งานห้องเสียงในสัปดาห์นี้ —']),
        '',
        summary + channelLine,
      ].join('\n'),
    )
    .setFooter({ text: `ส่งอัตโนมัติทุกวันจันทร์ 09:00 น. • เซิร์ฟเวอร์: ${guildName}` })
    .setTimestamp();
}

/** ส่งรายงานประจำสัปดาห์ของเซิร์ฟเวอร์หนึ่งไปยังห้องที่ตั้งไว้ — คืน true ถ้าส่งสำเร็จ */
export async function sendWeeklyReport(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  const channel =
    guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildText) return false;

  // สมาชิกที่ยังอยู่ในห้องเสียงตอนนี้ → เซสชันที่ยังไม่ปิดจะนับเวลาถึงปัจจุบัน
  const openNow = new Set<string>();
  for (const state of guild.voiceStates.cache.values()) {
    if (state.channelId) openNow.add(state.id);
  }

  const toMs = Date.now();
  const board = await getVoiceLeaderboard(guildId, WEEK_MS, openNow);
  if (!board) return false;

  const embed = buildWeeklyReportEmbed(guild.name, board, toMs - WEEK_MS, toMs);
  await channel.send({ embeds: [embed] });
  return true;
}

/** ตรวจว่ามีเซิร์ฟเวอร์ไหนถึงกำหนดส่งรายงานหรือยัง (เรียกซ้ำทุก 5 นาที) */
async function checkAndSend(client: Client): Promise<void> {
  if (!isDbReady()) return;

  const targets = await getWeeklyTargets();
  const nowMs = Date.now();

  for (const target of targets) {
    try {
      // เพิ่งตั้งค่าใหม่ (ยังไม่เคยส่ง) → ตั้งจุดเริ่มต้น แล้วเริ่มส่งรอบถัดไป
      if (!target.lastSent) {
        await markWeeklySent(target.guildId);
        continue;
      }

      // ยังไม่ถึงกำหนด (เทียบกับวันจันทร์ 09:00 ไทย ถัดจากครั้งล่าสุด)
      if (nowMs < nextWeeklyReportAt(target.lastSent.getTime())) continue;

      const sent = await sendWeeklyReport(client, target.guildId, target.channelId);
      if (sent) {
        await markWeeklySent(target.guildId);
        console.log(`[weekly] ส่งรายงานประจำสัปดาห์ของเซิร์ฟเวอร์ ${target.guildId} แล้ว`);
      } else {
        console.warn(
          `[weekly] ส่งรายงานของ ${target.guildId} ไม่สำเร็จ (หาห้องไม่เจอ/บอทไม่มีสิทธิ์) — จะลองใหม่รอบถัดไป`,
        );
      }
    } catch (error) {
      console.error(`[weekly] เกิดข้อผิดพลาดกับเซิร์ฟเวอร์ ${target.guildId}:`, error);
    }
  }
}

/** เริ่มตัวตรวจกำหนดการรายงานประจำสัปดาห์ (เรียกครั้งเดียวตอนบอทเริ่มทำงาน) */
export function startWeeklyScheduler(client: Client): void {
  const tick = (): void => {
    checkAndSend(client).catch((error) => console.error('[weekly] ตรวจกำหนดการผิดพลาด:', error));
  };
  setTimeout(tick, FIRST_CHECK_DELAY_MS);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log('🗓️ ระบบรายงานประจำสัปดาห์พร้อมแล้ว — จะส่งทุกวันจันทร์ 09:00 น. (เวลาไทย)');
}
