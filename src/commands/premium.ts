/**
 * src/commands/premium.ts
 * คำสั่ง /premium — ดูสถานะแพ็กเกจ + เปิด/ยกเลิก Premium
 *
 *   /premium status    → ดูสถานะของเซิร์ฟเวอร์นี้ (ทุกคนดูได้)
 *   /premium features  → ตารางเทียบว่าอะไรฟรี อะไร Premium (ทุกคนดูได้)
 *   /premium grant     → เปิดใช้/ต่ออายุ Premium (เจ้าของบอทเท่านั้น — OWNER_ID)
 *   /premium revoke    → ยกเลิก Premium ทันที (เจ้าของบอทเท่านั้น)
 *
 * ราคา: 29 บาท/เดือน ต่อเซิร์ฟเวอร์ (PREMIUM_PRICE_THB ใน utils/premium.ts)
 * หมายเหตุ: ยังไม่ต่อระบบชำระเงินออนไลน์ — เจ้าของบอทเป็นผู้เปิดใช้ให้ก่อน
 */
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { isDbReady } from '../utils/db';
import {
  countActiveSubscriptions,
  formatPremiumDate,
  grantPremium,
  isBotOwner,
  PREMIUM_FEATURES,
  PREMIUM_PERIOD_DAYS,
  PREMIUM_PRICE_THB,
  PREMIUM_SITE_URL,
  getPremiumState,
  revokePremium,
} from '../utils/premium';

const COLOR_PREMIUM = 0x5865f2; // น้ำเงิน Discord
const COLOR_FREE = 0x99a1af; // เทา
const COLOR_OK = 0x57f287;
const COLOR_ERROR = 0xed4245;

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('⭐ แพ็กเกจ Premium 29 บาท/เดือน — ดูสถานะ เปรียบเทียบฟีเจอร์ และเปิดใช้')
  .addSubcommand((subcommand) =>
    subcommand.setName('status').setDescription('ดูสถานะแพ็กเกจของเซิร์ฟเวอร์นี้'),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('features').setDescription('เทียบฟีเจอร์ระหว่างแพ็กเกจฟรีกับ Premium'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('grant')
      .setDescription('เปิดใช้/ต่ออายุ Premium ให้เซิร์ฟเวอร์ (เจ้าของบอทเท่านั้น)')
      .addStringOption((option) =>
        option
          .setName('เซิร์ฟเวอร์')
          .setDescription('ID เซิร์ฟเวอร์ที่ต้องการ (เว้นว่าง = เซิร์ฟเวอร์ที่พิมพ์คำสั่งนี้)')
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName('วัน')
          .setDescription(`จำนวนวัน (ค่าเริ่มต้น ${PREMIUM_PERIOD_DAYS} วัน = 1 เดือน)`)
          .setMinValue(1)
          .setMaxValue(3650)
          .setRequired(false),
      )
      .addStringOption((option) =>
        option.setName('หมายเหตุ').setDescription('บันทึกไว้ดูภายหลัง เช่น ช่องทางที่รับเงิน').setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('revoke')
      .setDescription('ยกเลิก Premium ของเซิร์ฟเวอร์ทันที (เจ้าของบอทเท่านั้น)')
      .addStringOption((option) =>
        option
          .setName('เซิร์ฟเวอร์')
          .setDescription('ID เซิร์ฟเวอร์ที่ต้องการ (เว้นว่าง = เซิร์ฟเวอร์ที่พิมพ์คำสั่งนี้)')
          .setRequired(false),
      ),
  );

/** ข้อความสรุปสิทธิ์ฝั่ง Premium (ใช้ทั้งใน status และ grant) */
function premiumBenefits(): string {
  return PREMIUM_FEATURES.filter((row) => row.free !== row.premium)
    .map((row) => `• **${row.name}** — ${row.premium}`)
    .join('\n');
}

/** ตรวจ ID เซิร์ฟเวอร์ที่ผู้ใช้ส่งมา (หรือใช้เซิร์ฟเวอร์ปัจจุบัน) */
function resolveGuildId(interaction: ChatInputCommandInteraction): string | null {
  const raw = interaction.options.getString('เซิร์ฟเวอร์')?.trim();
  if (!raw) return interaction.guild?.id ?? null;
  return /^\d{17,20}$/.test(raw) ? raw : null;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  // ── /premium status — ทุกคนดูได้ ────────────────────────────
  if (subcommand === 'status') {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const state = await getPremiumState(guild.id, { skipCache: true });

    if (!state.dbReady) {
      await interaction.editReply({
        content:
          '⚠️ ระบบ Premium ต้องใช้ฐานข้อมูลออนไลน์ แต่ตอนนี้ยังเชื่อมต่อไม่สำเร็จ\n' +
          '(ผู้ดูแลบอท: ตรวจสอบค่า DATABASE_URL)',
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(state.premium ? COLOR_PREMIUM : COLOR_FREE)
      .setTitle(state.premium ? '⭐ แพ็กเกจ Premium — ใช้งานอยู่' : '🎁 แพ็กเกจฟรี')
      .setDescription(
        state.premium
          ? `เซิร์ฟเวอร์ **${guild.name}** ใช้แพ็กเกจ **Premium** อยู่\n` +
              `ราคา **${state.priceThb} บาท/เดือน** • หมดอายุ **${formatPremiumDate(state.currentPeriodEnd)}**` +
              (state.daysLeft !== null ? ` (เหลือ ${state.daysLeft} วัน)` : '')
          : `เซิร์ฟเวอร์ **${guild.name}** ใช้แพ็กเกจ **ฟรี**\n` +
              `อัปเกรดเป็น **Premium ${PREMIUM_PRICE_THB} บาท/เดือน** เพื่อปลดล็อกฟีเจอร์ด้านล่าง`,
      )
      .addFields({
        name: `⭐ สิทธิ์ของ Premium (${PREMIUM_PRICE_THB} บาท/เดือน)`,
        value: premiumBenefits(),
      });

    if (state.premium) {
      embed.addFields({
        name: '🔄 ต่ออายุ',
        value: `ต่ออายุอัตโนมัติเมื่อจ่ายรอบถัดไป (ยังไม่เปิดชำระออนไลน์ — ติดต่อเจ้าของบอท)\n${PREMIUM_SITE_URL}`,
      });
    } else {
      embed.addFields({
        name: '💳 วิธีเปิดใช้',
        value:
          `ยังไม่เปิดให้ชำระเงินออนไลน์ — ติดต่อเจ้าของบอทเพื่อเปิดใช้ให้\n` +
          `รายละเอียดแพ็กเกจ: ${PREMIUM_SITE_URL}`,
      });
    }

    if (state.subscription?.grantedBy && isBotOwner(interaction.user.id)) {
      embed.setFooter({ text: `เปิดใช้โดย user ${state.subscription.grantedBy}` });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── /premium features — ทุกคนดูได้ ──────────────────────────
  if (subcommand === 'features') {
    const freeList = PREMIUM_FEATURES.map((row) => `• ${row.name} — **${row.free}**`).join('\n');
    const premiumList = PREMIUM_FEATURES.map((row) => `• ${row.name} — **${row.premium}**`).join('\n');

    const embed = new EmbedBuilder()
      .setColor(COLOR_PREMIUM)
      .setTitle('⭐ เปรียบเทียบแพ็กเกจ — Rem')
      .setDescription(
        `แพ็กเกจ **Premium ${PREMIUM_PRICE_THB} บาท/เดือน ต่อเซิร์ฟเวอร์**\n` +
          'ยกเลิกได้ทุกเมื่อ — ข้อมูลที่บันทึกไว้ยังอยู่ครบแม้กลับไปใช้แพ็กเกจฟรี',
      )
      .addFields(
        { name: '🎁 ฟรี (ทุกเซิร์ฟเวอร์)', value: freeList },
        { name: `⭐ Premium — ${PREMIUM_PRICE_THB} บาท/เดือน`, value: premiumList },
      )
      .setFooter({ text: PREMIUM_SITE_URL })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // ── ตั้งแต่ここลงไป: เฉพาะเจ้าของบอท ─────────────────────────
  if (!isBotOwner(interaction.user.id)) {
    await interaction.reply({
      content: '⛔ คำสั่งนี้ใช้ได้เฉพาะเจ้าของบอทเท่านั้น',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isDbReady()) {
    await interaction.reply({
      content: '⚠️ ต้องเชื่อมต่อฐานข้อมูลก่อน (ตรวจสอบ DATABASE_URL)',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = resolveGuildId(interaction);

  if (!guildId) {
    await interaction.editReply({
      content: '❌ ID เซิร์ฟเวอร์ไม่ถูกต้อง — ต้องเป็นตัวเลข 17–20 หลัก',
    });
    return;
  }

  // ── /premium grant ─────────────────────────────────────────
  if (subcommand === 'grant') {
    const days = interaction.options.getInteger('วัน') ?? PREMIUM_PERIOD_DAYS;
    const note = interaction.options.getString('หมายเหตุ');

    const subscription = await grantPremium({
      guildId,
      days,
      grantedBy: interaction.user.id,
      note: note ?? null,
    });

    if (!subscription) {
      await interaction.editReply({
        content: '❌ เปิดใช้ Premium ไม่สำเร็จ — ตรวจสอบ log ของบอทอีกครั้ง',
      });
      return;
    }

    const total = await countActiveSubscriptions();

    const embed = new EmbedBuilder()
      .setColor(COLOR_OK)
      .setTitle('✅ เปิดใช้/ต่ออายุ Premium แล้ว')
      .setDescription(`เซิร์ฟเวอร์ \`${guildId}\` เป็น Premium ถึง **${formatPremiumDate(subscription.currentPeriodEnd)}**`)
      .addFields(
        { name: '💵 ราคา', value: `${subscription.priceThb} บาท/เดือน`, inline: true },
        { name: '📅 ต่ออายุ', value: `+${days} วัน`, inline: true },
        { name: '⭐ Premium ทั้งหมด', value: `${total} เซิร์ฟเวอร์`, inline: true },
      )
      .setFooter({ text: 'สิทธิ์มีผลทันที — ไม่ต้องรีสตาร์ทบอท' })
      .setTimestamp();

    if (note) embed.addFields({ name: '📝 หมายเหตุ', value: note });
    if (interaction.guild?.id === guildId) {
      embed.addFields({
        name: '🔓 ปลดล็อกแล้ว',
        value: '/top ทั้งหมด • รายงานอัตโนมัติทุกจันทร์ 09:00 • ประวัติเต็ม + CSV ในแดชบอร์ด',
      });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── /premium revoke ────────────────────────────────────────
  const revoked = await revokePremium(guildId);
  if (!revoked) {
    await interaction.editReply({
      content: `⚠️ ไม่พบข้อมูล Premium ของเซิร์ฟเวอร์ \`${guildId}\``,
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setTitle('🔕 ยกเลิก Premium แล้ว')
        .setDescription(
          `เซิร์ฟเวอร์ \`${guildId}\` กลับไปใช้แพ็กเกจฟรีทันที\n` +
            'ข้อมูล voice log ที่บันทึกไว้ยังอยู่ครบ — เปิดใหม่ได้ด้วย `/premium grant`',
        )
        .setTimestamp(),
    ],
  });
}
