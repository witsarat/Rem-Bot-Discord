/**
 * src/commands/stop.ts
 * คำสั่ง /stop — ⏹️ หยุดเล่นทั้งหมด ล้างคิว และออกจากห้องเสียง (ต้องอยู่ในห้องเดียวกับบอท)
 */
import { ChatInputCommandInteraction, GuildMember, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getSessionSnapshot, stopAndLeave } from '../utils/music';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('⏹️ หยุดเพลงทั้งหมด ล้างคิว และให้บอทออกจากห้องเสียง');

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
      content: '⚠️ ต้องอยู่ในห้องเสียงเดียวกับบอทก่อนจึงจะสั่งหยุดได้ครับ',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ok = stopAndLeave(guild.id);
  await interaction.reply({
    content: ok ? '⏹️ หยุดเพลง + ออกจากห้องเสียงเรียบร้อยแล้ว' : '💤 ตอนนี้บอทไม่ได้เล่นเพลงอยู่',
    flags: MessageFlags.Ephemeral,
  });
}
