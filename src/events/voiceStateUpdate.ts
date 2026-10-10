/**
 * src/events/voiceStateUpdate.ts
 * ระบบหลักของบอท: ดักจับอีเวนต์การเข้า-ออก-ย้ายห้องเสียงของสมาชิก
 * - ส่งข้อความ Embed ไปยังห้อง voice-logs ที่ตั้งค่าไว้ (ตามสีของแต่ละเหตุการณ์)
 * - บันทึกประวัติลงฐานข้อมูลออนไลน์ด้วย (ถ้าตั้งค่า DATABASE_URL ไว้)
 */
import {
  ChannelType,
  EmbedBuilder,
  Events,
  Guild,
  TextChannel,
  VoiceBasedChannel,
  VoiceState,
} from 'discord.js';
import type { Client } from 'discord.js';
import { getLogChannelId } from '../utils/config';
import { insertVoiceLog } from '../utils/db';
import { isBeingShaken } from '../utils/shake';
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

  // 2.5) ถ้าสมาชิกกำลังถูกเขย่า (/shake) → ไม่บันทึก
  //      (การย้ายไปมาเป็นฝีมือของบอท ไม่ใช่กิจกรรมจริง — กัน log รก)
  if (isBeingShaken(member.id)) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // 3) แยกประเภทเหตุการณ์
  //    - เข้าห้อง (Join)  : เดิมไม่มีห้อง → มีห้องใหม่          → 🟢 เขียว
  //    - ออกห้อง (Leave)  : เดิมมีห้อง → กลายเป็นไม่มีห้อง      → 🔴 แดง
  //    - ย้ายห้อง (Move)  : มีทั้งสองห้อง และเป็นคนละห้องกัน     → 🟡 เหลือง
  //    - กรณีอื่นๆ (ปิด/เปิดไมค์, เปิดกล้อง ฯลฯ) → ไม่บันทึก
  let eventType: 'join' | 'leave' | 'move';
  let embed: EmbedBuilder;
  let joinLeaveChannel: VoiceBasedChannel | null = null; // ห้องของ join/leave
  let fromChannel: VoiceBasedChannel | null = null; // ห้องต้นทางของ move
  let toChannel: VoiceBasedChannel | null = null; // ห้องปลายทางของ move

  if (!oldChannel && newChannel) {
    eventType = 'join';
    joinLeaveChannel = newChannel;
    embed = createVoiceJoinEmbed(member, newChannel);
  } else if (oldChannel && !newChannel) {
    eventType = 'leave';
    joinLeaveChannel = oldChannel;
    embed = createVoiceLeaveEmbed(member, oldChannel);
  } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    eventType = 'move';
    fromChannel = oldChannel;
    toChannel = newChannel;
    embed = createVoiceMoveEmbed(member, oldChannel, newChannel);
  } else {
    return;
  }

  // 4) บันทึกประวัติลงฐานข้อมูลออนไลน์ (ถ้าเปิดใช้ — เก็บเสมอแม้ยังไม่ได้รัน /setup)
  await insertVoiceLog({
    guildId: newState.guild.id,
    userId: member.id,
    username: member.displayName,
    event: eventType,
    channelId: joinLeaveChannel?.id ?? null,
    channelName: joinLeaveChannel?.name ?? null,
    fromChannelId: fromChannel?.id ?? null,
    fromChannelName: fromChannel?.name ?? null,
    toChannelId: toChannel?.id ?? null,
    toChannelName: toChannel?.name ?? null,
  });

  // 5) หาห้อง voice-logs ของเซิร์ฟเวอร์นี้ (อ่านจาก DB ก่อน → ไฟล์สำรอง)
  const logChannelId = await getLogChannelId(newState.guild.id);
  if (!logChannelId) return; // เซิร์ฟเวอร์นี้ยังไม่เคย setup → ข้ามการส่ง Embed

  const logChannel = await findLogChannel(newState.guild, logChannelId);
  if (!logChannel) return; // หาห้องไม่เจอ (ถูกลบ / บอทมองไม่เห็น) → ข้ามไป

  // 6) ส่ง embed เข้าห้อง logs
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
