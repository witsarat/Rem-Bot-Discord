/**
 * src/commands/profile.ts
 * คำสั่ง /profile — การ์ดสมาชิกแบบรูปภาพ (ไม่ใช้ embed)
 *
 *   /profile            → การ์ดของคุณเอง
 *   /profile สมาชิก:@คน → การ์ดของสมาชิกคนนั้น
 *
 * ทุกคนเห็นสถิติเต็มเหมือนกัน (7 วัน / 30 วัน / ตลอดกาล / อันดับ / ห้องยอดนิยม)
 * ไม่มีเงื่อนไข Premium ในคำสั่งนี้แล้ว
 */
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { isDbReady } from '../utils/db';
import { formatVoiceDuration, getVoiceLeaderboard, getUserVoiceStats } from '../utils/voiceStats';
import { getCardTheme } from '../utils/cardLayout';
import { renderProfileCard } from '../utils/profileCard';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('🎧 การ์ดสมาชิก — เวลาในห้องเสียง อันดับ และข้อมูลของสมาชิก')
  .addUserOption((option) =>
    option.setName('สมาชิก').setDescription('ดูการ์ดของสมาชิกคนนี้ (เว้นว่าง = ตัวคุณเอง)').setRequired(false),
  );

/** เซสชันที่ยังไม่ปิดของสมาชิกที่ยังอยู่ในห้องเสียงตอนนี้ */
function openVoiceUsers(guild: NonNullable<ChatInputCommandInteraction['guild']>): Set<string> {
  const openNow = new Set<string>();
  for (const state of guild.voiceStates.cache.values()) {
    if (state.channelId) openNow.add(state.id);
  }
  return openNow;
}

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
        '⚠️ การ์ดสมาชิกต้องใช้ฐานข้อมูลออนไลน์ แต่ตอนนี้ยังเชื่อมต่อไม่สำเร็จ\n' +
        '(ผู้ดูแลเซิร์ฟเวอร์: ตรวจสอบค่า DATABASE_URL)',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetUser = interaction.options.getUser('สมาชิก') ?? interaction.user;
  if (targetUser.bot) {
    await interaction.reply({
      content: '🤖 บอทไม่มีการ์ดสมาชิก — สถิติจะนับเฉพาะสมาชิกที่เป็นคนเท่านั้น',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const member: GuildMember | null =
    guild.members.cache.get(targetUser.id) ??
    (await guild.members.fetch(targetUser.id).catch(() => null));
  const displayName = member?.displayName ?? targetUser.displayName ?? targetUser.username;

  const openNow = openVoiceUsers(guild);
  const [stats, board, theme] = await Promise.all([
    getUserVoiceStats(guild.id, targetUser.id, openNow),
    getVoiceLeaderboard(guild.id, null, openNow),
    getCardTheme(guild.id, 'profile'),
  ]);

  if (!stats) {
    await interaction.editReply({ content: '⚠️ ดึงสถิติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
    return;
  }

  const index = board?.rows.findIndex((row) => row.userId === targetUser.id) ?? -1;
  const rank = index >= 0 && board ? { place: index + 1, total: board.rows.length } : null;

  try {
    const png = await renderProfileCard({
      displayName,
      username: targetUser.username,
      avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
      guildName: guild.name,
      joinedAt: member?.joinedAt ?? null,
      rank,
      stats: {
        last7Ms: stats.last7.totalMs,
        last7Sessions: stats.last7.sessions,
        last30Ms: stats.last30.totalMs,
        last30Sessions: stats.last30.sessions,
        allMs: stats.all.totalMs,
        allSessions: stats.all.sessions,
        joins: stats.joins,
        topChannel: stats.topChannel?.name ?? null,
      },
    }, theme);

    await interaction.editReply({
      files: [new AttachmentBuilder(png, { name: 'ruru-profile.png' })],
    });
    return;
  } catch (error) {
    console.error('[profile] เรนเดอร์การ์ดไม่สำเร็จ — ส่งเป็นข้อความแทน:', error);
  }

  // แผนสำรอง: ข้อความล้วน (ไม่ใช้ embed)
  const lines = [
    `**${displayName}** · @${targetUser.username}`,
    `⏱️ 7 วัน: **${formatVoiceDuration(stats.last7.totalMs)}** • 30 วัน: **${formatVoiceDuration(stats.last30.totalMs)}** • ตลอดกาล: **${formatVoiceDuration(stats.all.totalMs)}**`,
    `🏆 อันดับ: **${rank ? `#${rank.place} จาก ${rank.total} คน` : 'ยังไม่ถูกจัดอันดับ'}** • 🔊 ห้องยอดนิยม: **${stats.topChannel?.name ?? '—'}** • 🚪 เข้าห้อง **${stats.joins}** ครั้ง`,
  ];

  await interaction.editReply({ content: lines.join('\n') });
}
