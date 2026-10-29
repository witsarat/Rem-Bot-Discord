/**
 * src/utils/embeds.ts
 * Embed สำหรับ voice log — ดีไซน์ใหม่แบบบรรทัดเดียว อ่านเร็ว ไม่รกห้อง
 *
 *   🟢 เขียว  = เข้าห้องเสียง (Join)
 *   🔴 แดง    = ออกจากห้องเสียง (Leave)
 *   🟡 เหลือง = ย้ายห้องเสียง (Move)
 *
 * โครงเดียวกันทุกเหตุการณ์:
 *   [avatar] @username
 *   สถานะตัวหนา
 *   🔊 #ห้อง · จำนวนคน
 *   ── RURU · Voice Log · เวลา
 */
import { EmbedBuilder, GuildMember, VoiceBasedChannel } from 'discord.js';

/** สีประจำเหตุการณ์ — โทนนุ่มลง อ่านง่ายบนธีมมืด/สว่างของ Discord */
export const VoiceLogColors = {
  /** 🟢 เขียว — สมาชิกเข้าห้องเสียง */
  Join: 0x3fb950,
  /** 🔴 แดง — สมาชิกออกจากห้องเสียง */
  Leave: 0xf85149,
  /** 🟡 เหลือง — สมาชิกย้ายห้องเสียง */
  Move: 0xd29922,
} as const;

/** ส่วนหัวของ embed ทุกอัน: @username + รูปโปรไฟล์ + footer + เวลาปัจจุบัน */
function baseVoiceEmbed(member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setAuthor({
      name: `@${member.user.username}`,
      iconURL: member.user.displayAvatarURL({ size: 128 }),
    })
    .setFooter({ text: 'RURU · Voice Log' })
    .setTimestamp();
}

/** Embed สีเขียว: เข้าห้องเสียง */
export function createVoiceJoinEmbed(member: GuildMember, channel: VoiceBasedChannel): EmbedBuilder {
  return baseVoiceEmbed(member)
    .setColor(VoiceLogColors.Join)
    .setDescription(`**เข้าห้องเสียง**\n🔊 ${channel} · ${channel.members.size} คนในห้อง`);
}

/** Embed สีแดง: ออกจากห้องเสียง */
export function createVoiceLeaveEmbed(member: GuildMember, channel: VoiceBasedChannel): EmbedBuilder {
  return baseVoiceEmbed(member)
    .setColor(VoiceLogColors.Leave)
    .setDescription(`**ออกจากห้องเสียง**\n🔇 ${channel} · เหลือ ${channel.members.size} คน`);
}

/** Embed สีเหลือง: ย้ายห้องเสียง */
export function createVoiceMoveEmbed(
  member: GuildMember,
  fromChannel: VoiceBasedChannel,
  toChannel: VoiceBasedChannel,
): EmbedBuilder {
  return baseVoiceEmbed(member)
    .setColor(VoiceLogColors.Move)
    .setDescription(`**ย้ายห้องเสียง**\n${fromChannel} → ${toChannel}`);
}
