/**
 * test-music-voice.ts — E2E: บอทเข้าห้องเสียงจริง → เล่นเพลง ~15 วิ → ออก
 * เลือกห้อง AFK ของเซิร์ฟเวอร์ (รบกวนน้อยที่สุด) เพื่อพิสูจน์ว่าสตรีมเสียงเข้า Discord ได้จริง
 */
import 'dotenv/config';
import { Client, Events, GatewayIntentBits, type VoiceBasedChannel } from 'discord.js';
import { enqueueTracks, getSessionSnapshot, stopAndLeave } from './src/utils/music';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

client.once(Events.ClientReady, async (readyClient) => {
  try {
    const preferredGuildId = (process.env.GUILD_ID ?? '').split(',')[0]?.trim();
    const guild = readyClient.guilds.cache.get(preferredGuildId) ?? readyClient.guilds.cache.first();
    if (!guild) throw new Error('ไม่พบเซิร์ฟเวอร์ให้ทดสอบ');

    const afk = guild.afkChannel;
    const emptyVoice = guild.channels.cache.find(
      (channel) => channel.isVoiceBased() && channel.members.size === 0 && channel.id !== afk?.id,
    ) as VoiceBasedChannel | undefined;
    const channel = afk ?? emptyVoice;
    if (!channel) throw new Error('ไม่พบห้องเสียง (AFK/ห้องว่าง) ให้ทดสอบ');

    console.log(`🎧 ทดสอบที่เซิร์ฟเวอร์ "${guild.name}" ห้อง "${channel.name}" (${channel.id})`);

    const tracks = [
      {
        title: 'ทดสอบระบบเพลง (Big Buck Bunny)',
        url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        durationSec: 0,
        requestedBy: 'ระบบทดสอบ',
      },
    ];
    const textChannel = guild.channels.cache.find(
      (ch) => ch.isTextBased() && ch.name.toLowerCase() === 'voice-logs',
    );
    const announceChannelId = textChannel?.id ?? guild.systemChannelId ?? '';
    const { added } = await enqueueTracks(guild, channel.id, announceChannelId, tracks);
    console.log('➕ เข้าคิว:', added, 'เพลง');

    // รอ 6 วิ → ต้องเริ่มเล่นแล้ว
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    const snap1 = getSessionSnapshot(guild.id);
    console.log('▶️ สถานะหลัง 6 วิ:', snap1?.current ? `กำลังเล่น "${snap1.current.title}"` : '(ไม่มีเพลงเล่น)');

    // รออีก 10 วิ → ต้องยังเล่นอยู่ (สตรีมไม่หลุด)
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const snap2 = getSessionSnapshot(guild.id);
    const stillPlaying = Boolean(snap2?.current);

    console.log(stillPlaying ? '✅ E2E ผ่าน — สตรีมเสียงเข้า Discord ได้จริงและต่อเนื่อง 16 วิ' : '⚠️ เพลงหลุด/จบก่อนกำหนด');

    stopAndLeave(guild.id);
    console.log('🚪 ออกจากห้องเสียงแล้ว');
    process.exitCode = stillPlaying ? 0 : 1;
  } catch (error) {
    console.error('❌ E2E ล้มเหลว:', error);
    process.exitCode = 1;
  } finally {
    setTimeout(() => process.exit(process.exitCode ?? 1), 2_000);
  }
});

client.login((process.env.DISCORD_TOKEN ?? '').trim()).catch((error: unknown) => {
  console.error('ล็อกอินไม่สำเร็จ:', error);
  process.exit(1);
});
