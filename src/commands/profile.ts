/**
 * src/commands/profile.ts
 * คำสั่ง /profile — การ์ดสมาชิกแบบสรุป (avatar + เวลาในห้องเสียง + อันดับ + บทบาท)
 *
 *   /profile           → การ์ดของคุณเอง
 *   /profile สมาชิก:@คน → การ์ดของสมาชิกคนนั้น
 *
 * แพ็กเกจ:
 *   ฟรี    — เวลา 7 วัน / 30 วัน, จำนวนครั้งที่เข้าห้อง, บทบาท, วันที่เข้าร่วม
 *   Premium — เพิ่มเวลารวมตลอดกาล, อันดับในเซิร์ฟเวอร์, ห้องยอดนิยม
 */
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { isDbReady } from '../utils/db';
import {
  formatPremiumDate,
  getPremiumState,
  PREMIUM_PRICE_THB,
  PREMIUM_SITE_URL,
} from '../utils/premium';
import { DAY_MS, formatVoiceDuration, getVoiceLeaderboard, getUserVoiceStats } from '../utils/voiceStats';
import { renderProfileCard } from '../utils/profileCard';

const COLOR_PREMIUM = 0x5865f2;
const COLOR_FREE = 0x99a1af;
const RANK_COLOR = 0xfee75c;

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

  const [premiumState, stats] = await Promise.all([
    getPremiumState(guild.id),
    getUserVoiceStats(guild.id, targetUser.id, openVoiceUsers(guild)),
  ]);

  if (!stats) {
    await interaction.editReply({ content: '⚠️ ดึงสถิติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
    return;
  }

  const premium = premiumState.premium;

  // อันดับตลอดกาล: คำนวณเฉพาะเมื่อเซิร์ฟเวอร์เป็น Premium (ประหยัด query ให้แพ็กเกจฟรี)
  let rank: { place: number; total: number } | null = null;
  if (premium) {
    const board = await getVoiceLeaderboard(guild.id, null, openVoiceUsers(guild));
    if (board) {
      const index = board.rows.findIndex((row) => row.userId === targetUser.id);
      if (index >= 0) rank = { place: index + 1, total: board.rows.length };
    }
  }

  const hasData = stats.all.sessions > 0 || stats.all.totalMs > 0;
  const roles = member
    ? member.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first(3)
        .map((role) => `${role}`)
    : [];

  // ── เรนเดอร์การ์ดเป็นรูป PNG (ถ้าล้มเหลวจะส่ง embed ข้อความแทน) ──
  let cardFile: AttachmentBuilder | null = null;
  try {
    const png = await renderProfileCard({
      displayName,
      username: targetUser.username,
      avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
      guildName: guild.name,
      joinedAt: member?.joinedAt ?? null,
      premium,
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
    });
    cardFile = new AttachmentBuilder(png, { name: 'profile.png' });
  } catch (error) {
    console.error('[profile] เรนเดอร์การ์ดไม่สำเร็จ — จะส่งเป็น embed แทน:', error);
  }

  if (cardFile) {
    const cardEmbed = new EmbedBuilder()
      .setColor(premium ? COLOR_PREMIUM : COLOR_FREE)
      .setAuthor({ name: displayName, iconURL: targetUser.displayAvatarURL({ size: 128 }) })
      .setTitle('🎧 การ์ดสมาชิก')
      .setDescription(
        [
          member
            ? `อยู่ในเซิร์ฟเวอร์นี้ตั้งแต่ **${formatPremiumDate(member.joinedAt)}**`
            : 'ไม่ได้อยู่ในเซิร์ฟเวอร์นี้แล้ว',
          premium
            ? '⭐ เซิร์ฟเวอร์นี้ใช้แพ็กเกจ **Premium** — ปลดล็อกสถิติตลอดกาล'
            : '🎁 แพ็กเกจฟรี — สถิติ 7/30 วัน (ตลอดกาลเป็นฟีเจอร์ Premium)',
          hasData ? null : 'ยังไม่มีข้อมูลห้องเสียงของสมาชิกคนนี้',
        ]
          .filter((line): line is string => line !== null)
          .join('\n'),
      )
      .setImage('attachment://profile.png')
      .setFooter({
        text: premium
          ? `⭐ Premium • ${PREMIUM_SITE_URL}`
          : `🔒 สถิติตลอดกาล/อันดับ ปลดล็อกด้วย Premium ${PREMIUM_PRICE_THB} บาท/เดือน • /premium`,
      })
      .setTimestamp();

    if (roles.length) cardEmbed.addFields({ name: '🎭 บทบาท', value: roles.join(' • ') });
    if (premium && rank && rank.place === 1) cardEmbed.setColor(RANK_COLOR);

    await interaction.editReply({ embeds: [cardEmbed], files: [cardFile] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(premium ? COLOR_PREMIUM : COLOR_FREE)
    .setAuthor({
      name: displayName,
      iconURL: targetUser.displayAvatarURL({ size: 128 }),
    })
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setTitle('🎧 การ์ดสมาชิก')
    .setDescription(
      [
        member ? `อยู่ในเซิร์ฟเวอร์นี้ตั้งแต่ **${formatPremiumDate(member.joinedAt)}**` : 'ไม่ได้อยู่ในเซิร์ฟเวอร์นี้แล้ว',
        premium
          ? `⭐ เซิร์ฟเวอร์นี้ใช้แพ็กเกจ **Premium** — ปลดล็อกสถิติตลอดกาล`
          : `🎁 แพ็กเกจฟรี — สถิติ 7/30 วัน (ตลอดกาลเป็นฟีเจอร์ Premium)`,
        hasData ? null : 'ยังไม่มีข้อมูลห้องเสียงของสมาชิกคนนี้',
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    )
    .addFields(
      {
        name: '⏱️ 7 วันล่าสุด',
        value: `${formatVoiceDuration(stats.last7.totalMs)}\nเข้าห้อง ${stats.last7.sessions} ครั้ง`,
        inline: true,
      },
      {
        name: '⏱️ 30 วันล่าสุด',
        value: `${formatVoiceDuration(stats.last30.totalMs)}\nเข้าห้อง ${stats.last30.sessions} ครั้ง`,
        inline: true,
      },
      {
        name: '🚪 เข้าห้องทั้งหมด',
        value: `${stats.joins} ครั้ง`,
        inline: true,
      },
    );

  // ── ส่วนของ Premium ────────────────────────────────────────
  if (premium) {
    embed.addFields(
      {
        name: '⏱️ เวลารวมตลอดกาล',
        value: `**${formatVoiceDuration(stats.all.totalMs)}**`,
        inline: true,
      },
      {
        name: '🏆 อันดับในเซิร์ฟเวอร์',
        value: rank ? `**#${rank.place}** จาก ${rank.total} คน` : 'ยังไม่ถูกจัดอันดับ',
        inline: true,
      },
      {
        name: '🔊 ห้องยอดนิยม',
        value: stats.topChannel
          ? `**${stats.topChannel.name}** (${stats.topChannel.count} ครั้ง)`
          : '—',
        inline: true,
      },
    );
  } else {
    embed.addFields({
      name: '🔒 ปลดล็อกด้วย Premium',
      value: [
        '• เวลารวมตลอดกาล',
        '• อันดับในเซิร์ฟเวอร์',
        '• ห้องยอดนิยม',
        `อัปเกรด **${PREMIUM_PRICE_THB} บาท/เดือน** ต่อเซิร์ฟเวอร์ → \`/premium\``,
      ].join('\n'),
    });
  }

  if (roles.length) {
    embed.addFields({ name: '🎭 บทบาท', value: roles.join(' • ') });
  }

  embed
    .setFooter({
      text: premium
        ? `⭐ Premium • ${PREMIUM_SITE_URL}`
        : `🔒 สถิติตลอดกาล/อันดับ ปลดล็อกด้วย Premium ${PREMIUM_PRICE_THB} บาท/เดือน • /premium`,
    })
    .setTimestamp();

  if (premium && rank && rank.place === 1) embed.setColor(RANK_COLOR);

  await interaction.editReply({ embeds: [embed] });
}
