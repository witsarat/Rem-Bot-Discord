/**
 * src/commands/setup.ts
 * คำสั่ง /setup — สำหรับผู้ดูแลเซิร์ฟเวอร์ (Administrator) เท่านั้น
 * สร้าง (หรือใช้ห้องเดิมชื่อ) "voice-logs" แล้วบันทึก Channel ID ลง config.json แยกตาม Guild
 */
import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { setLogChannelId } from '../utils/config';

/** ชื่อห้องที่จะใช้เก็บ log */
const LOG_CHANNEL_NAME = 'voice-logs';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('สร้าง/ตั้งค่าห้อง voice-logs สำหรับบันทึกการเข้า-ออกห้องเสียง (ผู้ดูแลเท่านั้น)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // ต้องใช้ในเซิร์ฟเวอร์เท่านั้น
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 1) มองหาห้องชื่อ voice-logs ที่มีอยู่แล้ว (ถ้ามี → ใช้ห้องเดิม)
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === LOG_CHANNEL_NAME,
  );
  let createdNew = false;

  // 2) ถ้ายังไม่มี → สร้างห้องใหม่
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: LOG_CHANNEL_NAME,
        type: ChannelType.GuildText,
        topic: '📝 บันทึกการเข้า-ออก-ย้ายห้องเสียงอัตโนมัติ (Voice Log)',
        reason: `ตั้งค่าระบบ Voice Log โดย ${interaction.user.username}`,
      });
      createdNew = true;
    } catch (error) {
      console.error('[setup] สร้างห้องไม่สำเร็จ:', error);
      await interaction.editReply({
        content:
          '❌ สร้างห้อง `voice-logs` ไม่สำเร็จ — บอทอาจขาดสิทธิ์ **จัดการช่อง (Manage Channels)**\n' +
          'กรุณาให้สิทธิ์บอทแล้วลองรัน `/setup` อีกครั้ง',
      });
      return;
    }
  }

  // 3) บันทึก Channel ID ลง config.json (แยกตาม Guild)
  setLogChannelId(guild.id, channel.id);

  // 4) ตอบกลับผู้ใช้ (เห็นเฉพาะคนที่พิมพ์คำสั่ง)
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('✅ ตั้งค่าระบบ Voice Log สำเร็จ')
    .setDescription(
      createdNew
        ? `สร้างห้อง ${channel} เรียบร้อยแล้ว`
        : `พบห้อง ${channel} ที่มีอยู่แล้ว จึงใช้ห้องเดิม`,
    )
    .addFields(
      { name: '📌 ห้องบันทึก', value: `${channel}`, inline: true },
      { name: '🆔 Channel ID', value: `\`${channel.id}\``, inline: true },
    )
    .setFooter({ text: `บันทึกค่าไว้ใน config.json แล้ว • เซิร์ฟเวอร์: ${guild.name}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
