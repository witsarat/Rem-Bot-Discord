/**
 * src/commands/play.ts
 * คำสั่ง /play — 🎵 เปิดเพลงจาก YouTube หรือ Spotify
 *   รองรับ: คำค้นหา YouTube, ลิงก์วิดีโอ YouTube, ลิงก์ Spotify (เพลง/อัลบั้ม/เพลย์ลิสต์)
 *   หมายเหตุ: ลิงก์ Spotify เล่นเสียงจาก YouTube เวอร์ชันเดียวกัน (ข้อจำกัดของ Spotify API)
 */
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { enqueueTracks, getSessionSnapshot, MUSIC_QUEUE_LIMIT, type QueuedTrack } from '../utils/music';
import { isSpotifyConfigured, parseSpotifyUrl, resolveSpotifyTracks } from '../utils/spotify';
import { getVideoInfo, searchYouTube } from '../utils/ytdlp';

const YOUTUBE_URL_RE = /youtube\.com\/(?:watch\?|shorts\/|live\/)|youtu\.be\//;

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('🎵 เปิดเพลงจาก YouTube หรือ Spotify (ลิงก์เพลง/อัลบั้ม/เพลย์ลิสต์ Spotify)')
  .addStringOption((option) =>
    option
      .setName('คำค้นหา')
      .setDescription('ชื่อเพลง, ลิงก์ YouTube หรือลิงก์ Spotify')
      .setRequired(true),
  );

/** แปลงคำค้นหา/ลิงก์ → รายการเพลงพร้อมคิว */
async function resolveTracks(
  query: string,
  requestedBy: string,
): Promise<{ tracks: QueuedTrack[]; note?: string }> {
  const trimmed = query.trim();

  // ── 1) ลิงก์ Spotify ──
  if (parseSpotifyUrl(trimmed)) {
    if (!isSpotifyConfigured()) {
      throw new Error(
        'ลิงก์ Spotify ต้องตั้งค่า `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` ก่อนครับ (ดูวิธีใน README หัวข้อเพลง)',
      );
    }
    const refs = await resolveSpotifyTracks(trimmed);
    const tracks: QueuedTrack[] = [];
    // แปลงเป็นเพลง YouTube ทีละ 4 พร้อมกัน (คุมโหลด CPU/เน็ต)
    for (let i = 0; i < refs.length; i += 4) {
      const chunk = refs.slice(i, i + 4);
      const found = await Promise.all(
        chunk.map(async (ref) => {
          const searchQuery = `${ref.artist} ${ref.title}`.trim();
          const results = await searchYouTube(searchQuery, 1).catch(() => []);
          const hit = results[0];
          if (!hit) return null;
          return {
            title: `${ref.artist} - ${ref.title}`,
            url: hit.url,
            durationSec: hit.durationSec,
            requestedBy,
          } satisfies QueuedTrack;
        }),
      );
      for (const track of found) if (track) tracks.push(track);
    }
    if (!tracks.length) throw new Error('ค้นหาเพลงจาก Spotify ใน YouTube ไม่เจอเลยสักเพลง ลองลิงก์อื่นดูครับ');
    return {
      tracks,
      note:
        refs.length > tracks.length ? `เพิ่มได้ ${tracks.length}/${refs.length} เพลง (บางเพลงหาไม่เจอ)` : undefined,
    };
  }

  // ── 2) ลิงก์ YouTube ตรง ๆ ──
  if (YOUTUBE_URL_RE.test(trimmed)) {
    const info = await getVideoInfo(trimmed);
    if (!info) throw new Error('ดึงข้อมูลวิดีโอไม่สำเร็จ — ตรวจสอบลิงก์อีกครั้ง');
    return { tracks: [{ title: info.title, url: info.url, durationSec: info.durationSec, requestedBy }] };
  }

  // ── 3) ค้นหา YouTube ──
  const results = await searchYouTube(trimmed, 5);
  const hit = results.find((video) => video.durationSec > 0) ?? results[0];
  if (!hit) throw new Error('ค้นหาไม่เจอ — ลองเปลี่ยนคำค้นหาหรือใช้ลิงก์ตรงครับ');
  return { tracks: [{ title: hit.title, url: hit.url, durationSec: hit.durationSec, requestedBy }] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member as GuildMember | null;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    await interaction.reply({
      content: '⚠️ เข้าห้องเสียงก่อนครับ แล้วค่อยใช้ /play',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ถ้าบอทกำลังเล่นอยู่ห้องอื่น ให้ไปเข้าห้องเดียวกันก่อน
  const snapshot = getSessionSnapshot(guild.id);
  if (snapshot && snapshot.voiceChannelId !== voiceChannel.id) {
    await interaction.reply({
      content: `⚠️ บอทกำลังเล่นอยู่ใน <#${snapshot.voiceChannelId}> — เข้าห้องนั้นก่อนนะครับ`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const query = interaction.options.getString('คำค้นหา', true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const requestedBy = member?.displayName ?? interaction.user.username;
    const { tracks, note } = await resolveTracks(query, requestedBy);
    const { added, startPosition } = await enqueueTracks(guild, voiceChannel.id, interaction.channelId, tracks);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('➕ เพิ่มลงคิวแล้ว')
      .setDescription(
        added === 1
          ? `**${tracks[0]?.title ?? ''}**\nจะเล่นเป็นลำดับที่ #${startPosition}`
          : `เพิ่ม **${added} เพลง**จากเพลย์ลิสต์ — เริ่มที่ลำดับ #${startPosition}`,
      );

    if (note) embed.setFooter({ text: note });
    if (added < tracks.length) embed.addFields({ name: '⚠️ คิวเต็ม', value: `รับได้แค่ ${added}/${tracks.length} เพลง (สูงสุด ${MUSIC_QUEUE_LIMIT})` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ ${error instanceof Error ? error.message : 'เปิดเพลงไม่สำเร็จ ลองใหม่อีกครั้ง'}`,
    });
  }
}
