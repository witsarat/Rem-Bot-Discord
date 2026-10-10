/**
 * src/commands/weekly.ts
 * คำสั่ง /weekly — จัดการรายงานประจำสัปดาห์ (ผู้ดูแลเซิร์ฟเวอร์เท่านั้น)
 *   /weekly set ห้อง:#ห้อง  → กำหนดห้องข้อความที่จะรับรายงาน
 *   /weekly off            → ปิดการส่งรายงาน
 *   /weekly now            → ส่งรายงานเดี๋ยวนี้ (สำหรับทดสอบ)
 *
 * รายงานอัตโนมัติจะถูกส่งทุกวันจันทร์ 09:00 น. เวลาไทย
 */
import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getWeeklyChannelId, setWeeklyChannelId } from '../utils/config';
import { isDbReady } from '../utils/db';
import { formatThaiDateTime, nextWeeklyReportAt, sendWeeklyReport } from '../utils/weeklyReport';

export const data = new SlashCommandBuilder()
  .setName('weekly')
  .setDescription('🗓️ ตั้งค่า/ปิดรายงานสรุปการใช้งานห้องเสียงประจำสัปดาห์ (ผู้ดูแลเซิร์ฟเวอร์)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set')
      .setDescription('กำหนดห้องข้อความที่จะรับรายงานประจำสัปดาห์')
      .addChannelOption((option) =>
        option
          .setName('ห้อง')
          .setDescription('ห้องที่จะส่งรายงาน (จะถูกส่งทุกวันจันทร์ 09:00 น.)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('off').setDescription('ปิดการส่งรายงานประจำสัปดาห์'),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('now').setDescription('ส่งรายงานประจำสัปดาห์ทันที (สำหรับทดสอบ)'),
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

  // เช็คสิทธิ์ผู้ดูแลอีกรอบ (กันเหนียว เผื่อสิทธิ์ของคำสั่งถูกแก้ในเซิร์ฟเวอร์)
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '⛔ คำสั่งนี้สำหรับผู้ดูแลเซิร์ฟเวอร์ (Administrator) เท่านั้น',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isDbReady()) {
    await interaction.reply({
      content:
        '⚠️ ระบบรายงานประจำสัปดาห์ต้องใช้ฐานข้อมูลออนไลน์ แต่ตอนนี้ยังเชื่อมต่อไม่สำเร็จ\n' +
        '(ตรวจสอบค่า DATABASE_URL ก่อนครับ)',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const subcommand = interaction.options.getSubcommand();

  // ── /weekly set — กำหนดห้องรับรายงาน ──────────────────────
  if (subcommand === 'set') {
    const channel = interaction.options.getChannel('ห้อง', true);
    await setWeeklyChannelId(guild.id, channel.id);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ ตั้งค่าห้องรายงานประจำสัปดาห์แล้ว')
      .setDescription(`รายงานสรุปการใช้งานห้องเสียงจะถูกส่งเข้า ${channel} ให้อัตโนมัติ`)
      .addFields(
        {
          name: '📅 รายงานถัดไป',
          value: `**${formatThaiDateTime(nextWeeklyReportAt(Date.now()))}** น. (เวลาไทย)`,
        },
        { name: '🆔 Channel ID', value: `\`${channel.id}\``, inline: true },
      )
      .setFooter({ text: 'ส่งอัตโนมัติทุกวันจันทร์ 09:00 น. • เก็บค่าไว้ในฐานข้อมูลออนไลน์' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── /weekly off — ปิดรายงาน ───────────────────────────────
  if (subcommand === 'off') {
    await setWeeklyChannelId(guild.id, null);

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔕 ปิดการส่งรายงานประจำสัปดาห์แล้ว')
      .setDescription('ระบบจะไม่ส่งรายงานอัตโนมัติอีก\nเปิดใหม่ได้ด้วย `/weekly set`')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── /weekly now — ส่งทันที (สำหรับทดสอบ) ───────────────────
  const channelId = await getWeeklyChannelId(guild.id);
  if (!channelId) {
    await interaction.editReply({
      content: '⚠️ ยังไม่ได้กำหนดห้องรับรายงาน — ใช้ `/weekly set` กำหนดห้องก่อนครับ',
    });
    return;
  }

  const sent = await sendWeeklyReport(interaction.client, guild.id, channelId);
  if (!sent) {
    await interaction.editReply({
      content:
        '⚠️ ส่งรายงานไม่สำเร็จ — ตรวจสอบว่าบอทมีสิทธิ์ **ส่งข้อความ** ในห้องนั้น และห้องยังอยู่',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('✅ ส่งรายงานทดสอบแล้ว')
    .setDescription(
      `รายงานถูกส่งเข้า <#${channelId}> เรียบร้อย\n(กำหนดการจริงจะยังส่งทุกวันจันทร์ 09:00 น. ตามปกติ)`,
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
