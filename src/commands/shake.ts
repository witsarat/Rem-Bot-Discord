/**
 * src/commands/shake.ts
 * คำสั่ง /shake — 🔔 เขย่าเรียกสมาชิก (ย้ายไปมาระหว่างห้องเสียง) — ผู้ดูแลเซิร์ฟเวอร์เท่านั้น
 * - เลือกแค่ "สมาชิก" — บอทเลือกห้องสลับให้เอง แล้วเขย่าไป-กลับ 5 ครั้ง (คงที่)
 *   จบแล้วสมาชิกกลับมาอยู่ห้องเดิมเสมอ
 * - กำหนดดีเลย์ระหว่างแต่ละครั้งได้ (มิลลิวินาที)
 * - ระหว่างถูกเขย่า การย้ายจะไม่ถูกบันทึกเป็น voice log
 */
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  pickBounceChannel,
  SHAKE_DEFAULT_DELAY_MS,
  SHAKE_MAX_DELAY_MS,
  SHAKE_MIN_DELAY_MS,
  SHAKE_ROUNDS,
  shakeMember,
} from '../utils/shake';

export const data = new SlashCommandBuilder()
  .setName('shake')
  .setDescription(`🔔 เขย่าเรียกสมาชิก — ย้ายไป-กลับ ${SHAKE_ROUNDS} ครั้ง แล้วกลับห้องเดิม (ผู้ดูแลเซิร์ฟเวอร์)`)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((option) =>
    option.setName('สมาชิก').setDescription('สมาชิกที่ต้องการเขย่า (ต้องอยู่ในห้องเสียงก่อน)').setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName('ดีเลย์')
      .setDescription(
        `หน่วงระหว่างการย้ายแต่ละครั้ง (มิลลิวินาที ${SHAKE_MIN_DELAY_MS}-${SHAKE_MAX_DELAY_MS}, ค่าเริ่มต้น ${SHAKE_DEFAULT_DELAY_MS})`,
      )
      .setMinValue(SHAKE_MIN_DELAY_MS)
      .setMaxValue(SHAKE_MAX_DELAY_MS),
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

  const targetUser = interaction.options.getUser('สมาชิก', true);
  const delay = interaction.options.getInteger('ดีเลย์') ?? SHAKE_DEFAULT_DELAY_MS;

  if (targetUser.bot) {
    await interaction.reply({
      content: '🤖 เขย่าบอทด้วยกันเองไม่สนุกนะครับ — เขย่าได้เฉพาะสมาชิกคนอื่นเท่านั้น',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // บอทต้องมีสิทธิ์ "ย้ายสมาชิก" ก่อน
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.MoveMembers)) {
    await interaction.reply({
      content:
        '⚠️ บอทขาดสิทธิ์ **Move Members (ย้ายสมาชิก)** — ให้สิทธิ์บอทแล้วลองใหม่อีกครั้งครับ',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ content: '❌ หาสมาชิกคนนี้ในเซิร์ฟเวอร์ไม่เจอ' });
    return;
  }

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.editReply({
      content: '⚠️ สมาชิกคนนี้ไม่ได้อยู่ในห้องเสียงตอนนี้ — ต้องอยู่ในห้องเสียงก่อนจึงจะเขย่าได้ครับ',
    });
    return;
  }

  // เลือก "ห้องสลับ" ให้อัตโนมัติ (AFK → ห้องว่าง → ห้องอื่น)
  const bounceChannel = pickBounceChannel(guild, voiceChannel.id);
  if (!bounceChannel) {
    await interaction.editReply({
      content: '⚠️ เซิร์ฟเวอร์นี้ต้องมีห้องเสียงอย่างน้อย 2 ห้อง (ตอนนี้มีห้องเดียว) จึงจะเขย่าได้ครับ',
    });
    return;
  }

  await interaction.editReply({ content: '🔔 กำลังเขย่า…' });

  const result = await shakeMember(member, voiceChannel.id, bounceChannel.id, delay);

  if (result.moved === 0) {
    await interaction.editReply({
      content:
        '⚠️ เขย่าไม่สำเร็จเลย — ตรวจสอบว่าบอทมีสิทธิ์ **Move Members** และ**ยศของบอทสูงกว่ายศเป้าหมาย** แล้วลองใหม่',
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('🔔 เขย่าเรียบร้อย!')
    .setDescription(
      `เขย่า **${member.displayName}** ไปกลับ ${SHAKE_ROUNDS} ครั้ง ระหว่าง <#${voiceChannel.id}> ↔ <#${bounceChannel.id}> แล้วกลับมาอยู่ห้องเดิม`,
    )
    .addFields(
      { name: '👤 สมาชิก', value: member.displayName, inline: true },
      { name: '🔁 จำนวนครั้ง (คงที่)', value: `${SHAKE_ROUNDS} ครั้ง (ไป-กลับ)`, inline: true },
      { name: '⏱️ ดีเลย์', value: `${delay} ms`, inline: true },
      { name: '🔊 ห้องที่ใช้สลับ', value: `<#${bounceChannel.id}>`, inline: true },
    )
    .setFooter({
      text:
        result.failed > 0
          ? `มี ${result.failed} ครั้งที่ย้ายไม่สำเร็จ (อาจติดสิทธิ์/ยศ) • ไม่ถูกบันทึกเป็น voice log`
          : 'สำเร็จทุกครั้ง • การเขย่าไม่ถูกบันทึกเป็น voice log',
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
