/**
 * src/utils/music.ts — ระบบเล่นเพลงในห้องเสียง (คิวแยกต่อเซิร์ฟเวอร์)
 *
 * แนวทางประหยัด CPU/RAM (เหมาะกับ Render 0.1 CPU / 512 MB):
 *   yt-dlp → สตรีม WebM/Opus → @discordjs/voice ส่งแบบ passthrough
 *   (มี WebmOpus demuxer ในตัว — ปกติไม่ต้องใช้ ffmpeg เลย)
 *   ถ้าคลิปเป็น AAC จะถอยไปใช้ ffmpeg (ffmpeg-static) แปลงให้อัตโนมัติ
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { Readable } from 'node:stream';
import ffmpegPath from 'ffmpeg-static';
import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { spawnAudioStream } from './ytdlp';

// ให้ @discordjs/voice ใช้ ffmpeg จาก ffmpeg-static (พกพาได้ทุกเครื่อง/Render)
if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;

/** เพลง 1 เพลงในคิว */
export interface QueuedTrack {
  title: string;
  url: string;
  durationSec: number;
  requestedBy: string;
}

/** สูงสุดต่อคิว (กันโหลดเกินบนฟรีไทร์) */
export const MUSIC_QUEUE_LIMIT = 50;

interface MusicSession {
  guild: Guild;
  voiceChannelId: string;
  textChannelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  tracks: QueuedTrack[];
  current: QueuedTrack | null;
  currentProcess: ChildProcess | null;
  destroyed: boolean;
}

const sessions = new Map<string, MusicSession>();

/** มุมมองข้อมูลคิวสำหรับคำสั่งต่าง ๆ */
export interface SessionSnapshot {
  voiceChannelId: string;
  current: QueuedTrack | null;
  upcoming: QueuedTrack[];
}

/** ดูสถานะคิวเพลงของเซิร์ฟเวอร์ */
export function getSessionSnapshot(guildId: string): SessionSnapshot | null {
  const session = sessions.get(guildId);
  if (!session) return null;
  return {
    voiceChannelId: session.voiceChannelId,
    current: session.current,
    upcoming: [...session.tracks],
  };
}

/**
 * เข้าห้องเสียง + เพิ่มเพลงลงคิว (ถ้าอยู่ในห้องอยู่แล้วจะใช้เซสชันเดิม)
 * @returns จำนวนเพลงที่รับเข้าคิว + ตำแหน่งเริ่มแรกในคิว
 */
export async function enqueueTracks(
  guild: Guild,
  voiceChannelId: string,
  textChannelId: string,
  tracks: QueuedTrack[],
): Promise<{ added: number; startPosition: number }> {
  const session = await ensureSession(guild, voiceChannelId, textChannelId);
  session.textChannelId = textChannelId;

  const room = Math.max(0, MUSIC_QUEUE_LIMIT - session.tracks.length);
  const accepted = tracks.slice(0, room);
  const startPosition = session.tracks.length + (session.current ? 1 : 0) + 1;
  session.tracks.push(...accepted);

  // เริ่มเล่นทันทีถ้ายังไม่มีเพลงเล่นอยู่
  if (!session.current) void playNext(guild.id);

  return { added: accepted.length, startPosition };
}

/** ข้ามเพลงปัจจุบัน (ถ้ามี) */
export function skipCurrent(guildId: string): boolean {
  const session = sessions.get(guildId);
  if (!session || !session.current) return false;
  session.player.stop(true); // → trigger Idle → playNext อัตโนมัติ
  return true;
}

/** หยุดทุกอย่าง + ออกจากห้องเสียง */
export function stopAndLeave(guildId: string): boolean {
  const session = sessions.get(guildId);
  if (!session) return false;
  destroySession(session, 'คำสั่ง /stop');
  return true;
}

/** สร้าง/ดึงเซสชันเพลงของเซิร์ฟเวอร์ แล้วเข้าห้องเสียงให้พร้อม */
async function ensureSession(guild: Guild, voiceChannelId: string, textChannelId: string): Promise<MusicSession> {
  const existing = sessions.get(guild.id);
  if (existing && !existing.destroyed) return existing;

  const connection = joinVoiceChannel({
    channelId: voiceChannelId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  const player = createAudioPlayer();
  const session: MusicSession = {
    guild,
    voiceChannelId,
    textChannelId,
    connection,
    player,
    tracks: [],
    current: null,
    currentProcess: null,
    destroyed: false,
  };
  sessions.set(guild.id, session);

  player.on(AudioPlayerStatus.Idle, () => {
    killCurrentProcess(session);
    session.current = null;
    if (session.destroyed) return;
    if (!hasHumans(session)) {
      void sendToText(session, '👋 ไม่มีคนอยู่ในห้องเสียงแล้ว — บอทออกจากห้องครับ');
      destroySession(session, 'ไม่มีคนในห้อง');
      return;
    }
    void playNext(guild.id);
  });

  player.on('error', (error) => {
    console.error('[music] player error:', error.message);
    // resource มีปัญหา → ข้ามไปเพลงถัดไป (Idle จะถูกยิงตามมา)
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    // ออกจากห้องโดยตรง หรือเน็ตสะดุด — ให้เวลากลับมา 5 วิ ไม่งั้นเลิก
    setTimeout(() => {
      if (!session.destroyed && connection.state.status !== VoiceConnectionStatus.Ready) {
        destroySession(session, 'การเชื่อมต่อห้องเสียงหลุด');
      }
    }, 5_000);
  });
  connection.on('error', (error) => console.error('[music] connection error:', error.message));

  connection.subscribe(player);
  console.log(`[music] เข้าห้องเสียง ${voiceChannelId} ของ ${guild.name}`);
  return session;
}

/** เล่นเพลงถัดไปในคิว (หรือออกจากห้องถ้าหมด) */
async function playNext(guildId: string): Promise<void> {
  const session = sessions.get(guildId);
  if (!session || session.destroyed) return;

  const next = session.tracks.shift();
  if (!next) {
    await sendToText(session, '⏹️ **คิวเพลงจบแล้ว** — บอทออกจากห้องเสียงครับ');
    destroySession(session, 'คิวว่าง');
    return;
  }

  session.current = next;
  try {
    const { child, stream } = await spawnAudioStream(next.url);
    session.currentProcess = child;
    child.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line.startsWith('ERROR')) console.error('[music] yt-dlp:', line.slice(0, 300));
    });

    const inputType = await sniffInputType(stream);
    const resource = createAudioResource(stream, { inputType });
    session.player.play(resource);

    await sendToText(
      session,
      `▶️ กำลังเล่น: **${next.title}**${next.durationSec ? ` (${formatTrackDuration(next.durationSec)})` : ''}\n👤 ขอโดย: ${next.requestedBy}`,
    );
  } catch (error) {
    console.error('[music] เริ่มเล่นไม่สำเร็จ:', error);
    session.current = null;
    await sendToText(session, `⚠️ เล่น **${next.title}** ไม่ได้ — ข้ามไปเพลงถัดไป`);
    // หน่วงนิดกันลูปเร็วเกินไป แล้วลองเพลงถัดไป
    setTimeout(() => void playNext(guildId), 500);
  }
}

/** อ่าน chunk แรกเพื่อดูว่าเป็น WebM/Opus (passthrough) หรือต้องใช้ ffmpeg */
async function sniffInputType(stream: Readable): Promise<StreamType> {
  stream.pause(); // อ่านแบบ paused mode — กันข้อมูลหายก่อนส่งต่อให้ player

  const first = await new Promise<Buffer | null>((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 30_000);
    const onReadable = (): void => {
      const chunk = stream.read(65_536) as Buffer | null;
      if (chunk && chunk.length > 0) {
        cleanup();
        resolve(chunk);
      }
    };
    const onEnd = (): void => {
      cleanup();
      resolve(null);
    };
    const onError = (): void => {
      cleanup();
      resolve(null);
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      stream.off('readable', onReadable);
      stream.off('end', onEnd);
      stream.off('error', onError);
    };
    stream.on('readable', onReadable);
    stream.once('end', onEnd);
    stream.once('error', onError);
    onReadable(); // เผื่อมีข้อมูลค้างใน buffer อยู่แล้ว
  });

  if (first) stream.unshift(first);
  const isWebm =
    first !== null && first.length >= 4 && first[0] === 0x1a && first[1] === 0x45 && first[2] === 0xdf && first[3] === 0xa3;
  return isWebm ? StreamType.WebmOpus : StreamType.Arbitrary;
}

/** มีคน (ที่ไม่ใช่บอท) อยู่ในห้องเสียงของเซสชันไหม */
function hasHumans(session: MusicSession): boolean {
  const channel = session.guild.channels.cache.get(session.voiceChannelId);
  if (!channel || !channel.isVoiceBased()) return true;
  return channel.members.some((member) => !member.user.bot);
}

/** ปิดเซสชันทั้งหมดของเซิร์ฟเวอร์ */
function destroySession(session: MusicSession, reason: string): void {
  session.destroyed = true;
  session.tracks = [];
  killCurrentProcess(session);
  try {
    session.player.stop(true);
  } catch {
    // ไม่เป็นไร
  }
  try {
    session.connection.destroy();
  } catch {
    // ไม่เป็นไร
  }
  sessions.delete(session.guild.id);
  console.log(`[music] ออกจากห้องเสียงของ ${session.guild.name} (${reason})`);
}

/** ฆ่า process สตรีมเพลงปัจจุบัน (ถ้ามี) */
function killCurrentProcess(session: MusicSession): void {
  const child = session.currentProcess;
  session.currentProcess = null;
  if (child && !child.killed) {
    try {
      child.kill('SIGKILL');
    } catch {
      // ไม่เป็นไร
    }
  }
}

/** ส่งข้อความเข้า�ห้องที่สั่งคำสั่ง (เงียบ ๆ ถ้าหาไม่เจอ) */
async function sendToText(session: MusicSession, content: string): Promise<void> {
  const channelId = session.textChannelId;
  if (!/^\d{17,20}$/.test(channelId)) return; // ไม่มีช่องให้ส่ง (หรือ id ไม่ถูกต้อง)
  try {
    const cached = session.guild.channels.cache.get(channelId);
    const fetched = cached ?? (await session.guild.channels.fetch(channelId).catch(() => null));
    const channel = fetched as TextChannel | null;
    // ตรวจแบบ duck-typing: ต้องมีเมธอดจริง (กันกรณี fetch คืนค่าที่ไม่ใช่ช่อง เช่น Collection ว่าง)
    if (channel && typeof channel.isTextBased === 'function' && channel.isTextBased()) {
      await channel.send({ embeds: [buildNowPlayingEmbed(content)] });
    }
  } catch (error) {
    console.error('[music] ส่งข้อความเข้าห้องไม่สำเร็จ:', error);
  }
}

/** ทำ embed ประกาศเพลงแบบเรียบง่าย */
function buildNowPlayingEmbed(content: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x5865f2).setDescription(content).setTimestamp();
}

/** แปลงวินาทีเป็น mm:ss / h:mm:ss */
export function formatTrackDuration(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** จำนวน process เผื่อ debug: จำนวนเซสชันที่เปิดอยู่ */
export function activeSessionCount(): number {
  return sessions.size;
}
