/**
 * src/utils/voicePresence.ts
 * ซิงก์ "ห้องเสียงปัจจุบัน" ของทุกเซิร์ฟเวอร์ลง DB (ตาราง voice_snapshot)
 * เก็บ: รายชื่อห้องเสียง (เรียงตามตำแหน่ง) + คนที่อยู่ในแต่ละห้อง (ไม่รวมบอท)
 * อัปเดต: ทันทีแบบ debounce เมื่อมีอีเวนต์เสียง/ห้อง + ซิงก์ทวนทุก 60 วินาที
 */
import { ChannelType, type Client, type Guild } from 'discord.js';
import { setVoiceSnapshotDb } from './db';

/** ข้อมูลห้องเสียง 1 ห้อง (ฝั่งเว็บอ่าน shape นี้) */
export interface VoiceChannelInfo {
  id: string;
  name: string;
  position: number;
  userLimit: number | null;
}

/** คนที่อยู่ในห้องเสียงตอนนี้ */
export interface VoiceOccupant {
  userId: string;
  displayName: string;
  avatar: string | null;
  channelId: string;
}

export interface VoiceSnapshotData {
  channels: VoiceChannelInfo[];
  occupants: VoiceOccupant[];
}

/** สร้าง snapshot ปัจจุบันของเซิร์ฟเวอร์จาก cache ของบอท */
export function buildVoiceSnapshot(guild: Guild): VoiceSnapshotData {
  const channels: VoiceChannelInfo[] = guild.channels.cache
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice,
    )
    .map((channel) => {
      const userLimit =
        'userLimit' in channel
          ? ((channel as { userLimit: number | null }).userLimit ?? null)
          : null;
      return { id: channel.id, name: channel.name, position: channel.position, userLimit };
    })
    .sort((a, b) => a.position - b.position);

  const occupants: VoiceOccupant[] = [];
  for (const state of guild.voiceStates.cache.values()) {
    if (!state.channelId) continue;
    const member = state.member;
    if (member?.user.bot) continue; // ไม่แสดงบอท
    occupants.push({
      userId: state.id,
      displayName: member?.displayName ?? member?.user.username ?? `ผู้ใช้ ${state.id}`,
      avatar: member?.user.avatar ?? null,
      channelId: state.channelId,
    });
  }

  return { channels, occupants };
}

/** คิว debounce ต่อเซิร์ฟเวอร์ — กันเขียนถี่เกินตอนคนเข้า-ออกพร้อมกัน */
const pendingSync = new Map<string, ReturnType<typeof setTimeout>>();

/** นัดซิงก์เซิร์ฟเวอร์นี้ (เรียกจากอีเวนต์เสียง/ห้อง) */
export function scheduleGuildVoiceSync(guild: Guild): void {
  const existing = pendingSync.get(guild.id);
  if (existing) clearTimeout(existing);
  pendingSync.set(
    guild.id,
    setTimeout(() => {
      pendingSync.delete(guild.id);
      void setVoiceSnapshotDb(guild.id, buildVoiceSnapshot(guild));
    }, 900),
  );
}

/** เริ่มระบบซิงก์ — ซิงก์ทันทีตอนออนไลน์ + ซิงก์ทวนทุก 60 วินาที */
export function startVoiceSnapshotSync(client: Client): void {
  const syncAll = (): void => {
    for (const guild of client.guilds.cache.values()) {
      void setVoiceSnapshotDb(guild.id, buildVoiceSnapshot(guild));
    }
  };
  syncAll();
  setInterval(syncAll, 60_000);
}
