/**
 * src/commands/index.ts
 * รวมคำสั่งทั้งหมดไว้ใน Collection เดียว
 * วิธีเพิ่มคำสั่งใหม่: สร้างไฟล์ในโฟลเดอร์นี้ (export `data` + `execute`)
 * แล้ว import เพิ่มในลิสต์ด้านล่าง
 */
import { ChatInputCommandInteraction, Collection, SlashCommandBuilder } from 'discord.js';
import * as help from './help';
import * as setup from './setup';

export interface BotCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands = new Collection<string, BotCommand>();

for (const command of [setup, help]) {
  commands.set(command.data.name, command);
}
