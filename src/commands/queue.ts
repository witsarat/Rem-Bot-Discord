/**
 * src/commands/queue.ts
 * คำสั่ง /queue — 📜 ดูคิวเพลงปัจจุบัน (เพลงที่เล่นอยู่ + 10 เพลงถัดไป)
 */
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatTrackDuration, getSessionSnapshot } from '../utils/music';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('📜 ดูคิวเพลงปัจจุบันของเซิร์ฟเวอร์');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
    return;
  }

  const snapshot = getSessionSnapshot(guild.id);
  if (!snapshot || (!snapshot.current && snapshot.upcoming.length === 0)) {
    await interaction.reply({
      content: '💤 ตอนนี้ไม่มีคิวเพลง — ใช้ `/play` เพื่อเปิดเพลงได้เลย',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines: string[] = [];
  if (snapshot.current) {
    const cur = snapshot.current;
    lines.push(
      `▶️ **กำลังเล่น:** ${cur.title}${cur.durationSec ? ` (${formatTrackDuration(cur.durationSec)})` : ''}`,
      '',
    );
  }

  if (snapshot.upcoming.length) {
    lines.push(`📋 **ถัดไป (${snapshot.upcoming.length} เพลง):**`);
    snapshot.upcoming.slice(0, 10).forEach((track, index) => {
      lines.push(
        `\`${index + 1}.\` ${track.title}${track.durationSec ? ` — ${formatTrackDuration(track.durationSec)}` : ''}`,
      );
    });
    if (snapshot.upcoming.length > 10) lines.push(`… และอีก ${snapshot.upcoming.length - 10} เพลง`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📜 คิวเพลง')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `ห้องเสียง: ${snapshot.voiceChannelId} • ใช้ /skip เพื่อข้าม • /stop เพื่อจบ` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
