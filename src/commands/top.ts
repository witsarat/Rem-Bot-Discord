/**
 * src/commands/top.ts
 * คำสั่ง /top — 🏆 จัดอันดับสมาชิกตามเวลารวมที่อยู่ในห้องเสียง (ดึงจากฐานข้อมูล)
 * - เลือกช่วงเวลาได้: ทั้งหมด (ค่าเริ่มต้น) / 7 วันล่าสุด / 30 วันล่าสุด
 * - ระบุตัวเลือก "สมาชิก" เพื่อดูสถิติรายบุคคล (ตอบกลับแบบเห็นเฉพาะผู้พิมพ์)
 */
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { isDbReady } from '../utils/db';
import { DAY_MS, formatVoiceDuration, getVoiceLeaderboard } from '../utils/voiceStats';

const TOP_COUNT = 10;
const RANK_COLOR = 0xfee75c; // 🏆 สีทอง

/** ตัวเลือกช่วงเวลา → ป้ายชื่อ + ระยะเวลาย้อนหลัง (null = ทั้งหมด) */
const PERIODS: Record<string, { label: string; ms: number | null }> = {
  all: { label: 'ทั้งหมด', ms: null },
  '7d': { label: '7 วันล่าสุด', ms: 7 * DAY_MS },
  '30d': { label: '30 วันล่าสุด', ms: 30 * DAY_MS },
};

export const data = new SlashCommandBuilder()
  .setName('top')
  .setDescription('🏆 จัดอันดับสมาชิกที่อยู่ในห้องเสียงนานที่สุด (ดึงข้อมูลจากฐานข้อมูล)')
  .addStringOption((option) =>
    option
      .setName('ช่วงเวลา')
      .setDescription('ช่วงเวลาของสถิติ (ค่าเริ่มต้น: ทั้งหมด)')
      .addChoices(
        { name: 'ทั้งหมด', value: 'all' },
        { name: '7 วันล่าสุด', value: '7d' },
        { name: '30 วันล่าสุด', value: '30d' },
      ),
  )
  .addUserOption((option) =>
    option.setName('สมาชิก').setDescription('ดูสถิติเฉพาะของสมาชิกคนนี้แทนการจัดอันดับ'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isDbReady()) {
    await interaction.reply({
      content:
        '⚠️ คำสั่งนี้ต้องใช้ฐานข้อมูลออนไลน์ แต่ตอนนี้ยังเชื่อมต่อไม่สำเร็จ\n' +
        '(ผู้ดูแลเซิร์ฟเวอร์: ตรวจสอบค่า DATABASE_URL)',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const period = PERIODS[interaction.options.getString('ช่วงเวลา') ?? 'all'] ?? PERIODS.all;
  const targetUser = interaction.options.getUser('สมาชิก');

  // สมาชิกที่ยังอยู่ในห้องเสียงตอนนี้ → เซสชันที่ยังไม่ปิดจะนับเวลาถึงปัจจุบัน
  const openNow = new Set<string>();
  for (const state of guild.voiceStates.cache.values()) {
    if (state.channelId) openNow.add(state.id);
  }

  await interaction.deferReply(targetUser ? { flags: MessageFlags.Ephemeral } : {});

  const board = await getVoiceLeaderboard(guild.id, period.ms, openNow);
  if (!board) {
    await interaction.editReply({ content: '⚠️ ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
    return;
  }

  // ── โหมดดูรายบุคคล ─────────────────────────────────────────
  if (targetUser) {
    if (targetUser.bot) {
      await interaction.editReply({ content: '🤖 บอทจะไม่ถูกนับในสถิติห้องเสียง' });
      return;
    }

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const displayName = member?.displayName ?? targetUser.displayName ?? targetUser.username;
    const index = board.rows.findIndex((row) => row.userId === targetUser.id);

    const embed = new EmbedBuilder()
      .setColor(RANK_COLOR)
      .setTitle(`📊 สถิติห้องเสียงของ ${displayName}`)
      .setFooter({ text: `ช่วง: ${period.label} • 🗄️ จากฐานข้อมูล` })
      .setTimestamp();

    if (index === -1) {
      embed.setDescription(
        `ยังไม่มีข้อมูลการอยู่ในห้องเสียงของสมาชิกคนนี้ (ช่วง: **${period.label}**)`,
      );
    } else {
      const row = board.rows[index];
      embed
        .setDescription(`🏆 อยู่ในห้องเสียงมากเป็น **อันดับ #${index + 1}** จาก ${board.rows.length} คน`)
        .addFields(
          {
            name: '⏱️ เวลารวมในห้องเสียง',
            value: `**${formatVoiceDuration(row.totalMs)}**`,
            inline: true,
          },
          { name: '🚪 จำนวนครั้งที่เข้าห้อง', value: `**${row.sessions}** ครั้ง`, inline: true },
        );
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── โหมดจัดอันดับ (สูงสุด 10 อันดับ) ─────────────────────────
  const topRows = board.rows.slice(0, TOP_COUNT);

  // ดึงชื่อที่แสดงปัจจุบันของแต่ละคน (ถ้ายังอยู่ในเซิร์ฟเวอร์)
  const displayNames = new Map<string, string>();
  await Promise.all(
    topRows.map(async (row) => {
      const cached = guild.members.cache.get(row.userId);
      const member: GuildMember | null =
        cached ?? (await guild.members.fetch(row.userId).catch(() => null));
      displayNames.set(row.userId, member?.displayName ?? row.username);
    }),
  );

  const medals = ['🥇', '🥈', '🥉'];
  const lines = topRows.map((row, index) => {
    const place = medals[index] ?? `**${index + 1}.**`;
    const name = displayNames.get(row.userId) ?? row.username;
    return `${place} **${name}** — ⏱️ รวม ${formatVoiceDuration(row.totalMs)} • เข้าห้อง ${row.sessions} ครั้ง`;
  });

  const liveCount = openNow.size;
  const description = board.rows.length
    ? [
        `📅 ช่วง: **${period.label}**`,
        '',
        ...lines,
        '',
        '──────────',
        `👥 สมาชิกที่ใช้งาน: **${board.participants} คน** • ⏱️ เวลารวมทุกคน: **${formatVoiceDuration(board.totalMs)}**`,
        liveCount > 0 ? `🟢 ตอนนี้อยู่ในห้องเสียง: **${liveCount} คน**` : null,
      ]
        .filter((line): line is string => line !== null)
        .join('\n')
    : `ยังไม่มีข้อมูลการใช้งานห้องเสียง (ช่วง: **${period.label}**)\nเมื่อสมาชิกเข้า-ออกห้องเสียง ระบบจะเริ่มเก็บสถิติอัตโนมัติ`;

  const embed = new EmbedBuilder()
    .setColor(RANK_COLOR)
    .setTitle('🏆 จัดอันดับ — อยู่ในห้องเสียงนานที่สุด')
    .setDescription(description)
    .setFooter({ text: '🗄️ ดึงจากฐานข้อมูล • นับรวมทุกครั้งที่เข้าห้อง • ผู้ที่ยังอยู่ในห้องเสียงจะนับถึงปัจจุบัน' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
