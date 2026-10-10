/**
 * src/commands/skip.ts
 * คำสั่ง /skip — ⏭️ ข้ามเพลงปัจจุบัน (ต้องอยู่ในห้องเดียวกับบอท)
 */
import { ChatInputCommandInteraction, GuildMember, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getSessionSnapshot, skipCurrent } from '../utils/music';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('⏭️ ข้ามเพลงที่กำลังเล่นอยู่ตอนนี้');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
    return;
  }

  const snapshot = getSessionSnapshot(guild.id);
  const member = interaction.member as GuildMember | null;
  if (!snapshot || member?.voice?.channelId !== snapshot.voiceChannelId) {
    await interaction.reply({
      content: '⚠️ ต้องอยู่ในห้องเสียงเดียวกับบอทก่อนจึงจะข้ามเพลงได้ครับ',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ok = skipCurrent(guild.id);
  await interaction.reply({
    content: ok ? '⏭️ ข้ามเพลงแล้ว' : '💤 ตอนนี้ยังไม่มีเพลงเล่นอยู่',
    flags: MessageFlags.Ephemeral,
  });
}
