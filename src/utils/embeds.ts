/**
 * src/utils/embeds.ts
 * ตัวช่วยสร้างข้อความ Embed สำหรับ voice log พร้อมสีประจำแต่ละเหตุการณ์
 *   🟢 เขียว  = เข้าห้องเสียง (Join)
 *   🔴 แดง    = ออกจากห้องเสียง (Leave)
 *   🟡 เหลือง = ย้ายห้องเสียง (Move)
 */
import { EmbedBuilder, GuildMember, VoiceBasedChannel } from 'discord.js';

/** สีประจำเหตุการณ์ (ใช้ในฟีเจอร์ Voice Log) */
export const VoiceLogColors = {
  /** 🟢 เขียว — สมาชิกเข้าห้องเสียง */
  Join: 0x57f287,
  /** 🔴 แดง — สมาชิกออกจากห้องเสียง */
  Leave: 0xed4245,
  /** 🟡 เหลือง — สมาชิกย้ายห้องเสียง */
  Move: 0xfee75c,
} as const;

/** ส่วนหัวของ embed ทุกอัน: ชื่อ + รูปโปรไฟล์ + footer + เวลาปัจจุบัน */
function baseVoiceEmbed(member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setAuthor({
      name: member.displayName,
      iconURL: member.user.displayAvatarURL({ size: 128 }),
    })
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();
}

/** Embed สีเขียว: เข้าห้องเสียง */
export function createVoiceJoinEmbed(member: GuildMember, channel: VoiceBasedChannel): EmbedBuilder {
  return baseVoiceEmbed(member)
    .setColor(VoiceLogColors.Join)
    .setTitle('🟢 เข้าห้องเสียง (Join)')
    .setDescription(`➡️ ${member} เข้าห้องเสียง **${channel.name}**`)
    .addFields(
      { name: '🔊 ห้องเสียง', value: `${channel}`, inline: true },
      { name: '👥 สมาชิกในห้อง', value: `${channel.members.size} คน`, inline: true },
    );
}

/** Embed สีแดง: ออกจากห้องเสียง */
export function createVoiceLeaveEmbed(member: GuildMember, channel: VoiceBasedChannel): EmbedBuilder {
  return baseVoiceEmbed(member)
    .setColor(VoiceLogColors.Leave)
    .setTitle('🔴 ออกจากห้องเสียง (Leave)')
    .setDescription(`⬅️ ${member} ออกจากห้องเสียง **${channel.name}**`)
    .addFields(
      { name: '🔊 ห้องเสียง', value: `${channel}`, inline: true },
      { name: '👥 สมาชิกคงเหลือ', value: `${channel.members.size} คน`, inline: true },
    );
}

/** Embed สีเหลือง: ย้ายห้องเสียง */
export function createVoiceMoveEmbed(
  member: GuildMember,
  fromChannel: VoiceBasedChannel,
  toChannel: VoiceBasedChannel,
): EmbedBuilder {
  return baseVoiceEmbed(member)
    .setColor(VoiceLogColors.Move)
    .setTitle('🟡 ย้ายห้องเสียง (Move)')
    .setDescription(`🔄 ${member} ย้ายห้องเสียง`)
    .addFields(
      { name: '📤 จากห้อง', value: `${fromChannel}`, inline: true },
      { name: '📥 ไปห้อง', value: `${toChannel}`, inline: true },
    );
}
