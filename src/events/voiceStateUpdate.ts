/**
 * src/events/voiceStateUpdate.ts
 * ระบบหลักของบอท: ดักจับอีเวนต์การเข้า-ออก-ย้ายห้องเสียงของสมาชิก
 * แล้วส่งข้อความ Embed ไปยังห้อง voice-logs ที่ตั้งค่าไว้ (ตามสีของแต่ละเหตุการณ์)
 */
import { ChannelType, EmbedBuilder, Events, Guild, TextChannel, VoiceState } from 'discord.js';
import type { Client } from 'discord.js';
import { getLogChannelId } from '../utils/config';
import { createVoiceJoinEmbed, createVoiceLeaveEmbed, createVoiceMoveEmbed } from '../utils/embeds';

/** ลงทะเบียนอีเวนต์ voiceStateUpdate เข้ากับ client */
export function registerVoiceStateUpdate(client: Client): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState).catch((error) => {
      console.error('[voiceStateUpdate] เกิดข้อผิดพลาด:', error);
    });
  });
}

/** ทำงานจริงเมื่อมีอีเวนต์ voice state เปลี่ยนแปลง */
async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  // 1) หาตัวสมาชิก (บางกรณี member จะอยู่ใน state ใด state หนึ่งเท่านั้น)
  const member = newState.member ?? oldState.member;
  if (!member) return;

  // 2) ไม่บันทึกการเคลื่อนไหวของบอท
  if (member.user.bot) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // 3) แยกประเภทเหตุการณ์
  //    - เข้าห้อง (Join)  : เดิมไม่มีห้อง → มีห้องใหม่          → 🟢 เขียว
  //    - ออกห้อง (Leave)  : เดิมมีห้อง → กลายเป็นไม่มีห้อง      → 🔴 แดง
  //    - ย้ายห้อง (Move)  : มีทั้งสองห้อง และเป็นคนละห้องกัน     → 🟡 เหลือง
  //    - กรณีอื่นๆ (ปิด/เปิดไมค์, เปิดกล้อง, ปิดหูฟัง ฯลฯ) → ไม่บันทึก
  let embed: EmbedBuilder;
  if (!oldChannel && newChannel) {
    embed = createVoiceJoinEmbed(member, newChannel);
  } else if (oldChannel && !newChannel) {
    embed = createVoiceLeaveEmbed(member, oldChannel);
  } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    embed = createVoiceMoveEmbed(member, oldChannel, newChannel);
  } else {
    return;
  }

  // 4) หาห้อง voice-logs ของเซิร์ฟเวอร์นี้ (ค่า ID มาจาก config.json ที่บันทึกไว้ตอนรัน /setup)
  const logChannelId = getLogChannelId(newState.guild.id);
  if (!logChannelId) return; // เซิร์ฟเวอร์นี้ยังไม่เคย setup → ข้ามไป

  const logChannel = await findLogChannel(newState.guild, logChannelId);
  if (!logChannel) return; // หาห้องไม่เจอ (ถูกลบ / บอทมองไม่เห็น) → ข้ามไป

  // 5) ส่ง embed เข้าห้อง logs
  await logChannel.send({ embeds: [embed] });
}

/** หาห้องข้อความจาก cache ก่อน ถ้าไม่เจอค่อย fetch จาก API */
async function findLogChannel(guild: Guild, channelId: string): Promise<TextChannel | null> {
  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));

  // ใช้ได้เฉพาะห้องข้อความปกติ (ห้องที่ /setup สร้างจะเป็นแบบนี้เสมอ)
  if (channel && channel.type === ChannelType.GuildText) {
    return channel;
  }
  return null;
}
