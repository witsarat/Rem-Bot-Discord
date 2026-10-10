/**
 * src/commands/index.ts
 * รวมคำสั่งทั้งหมดไว้ใน Collection เดียว
 * วิธีเพิ่มคำสั่งใหม่: สร้างไฟล์ในโฟลเดอร์นี้ (export `data` + `execute`)
 * แล้ว import เพิ่มในลิสต์ด้านล่าง
 */
import {
  ChatInputCommandInteraction,
  Collection,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import * as help from './help';
import * as play from './play';
import * as queue from './queue';
import * as setup from './setup';
import * as shake from './shake';
import * as skip from './skip';
import * as stop from './stop';
import * as top from './top';
import * as weekly from './weekly';

/** รูปแบบ builder ที่ discord.js คืนกลับตามชนิดตัวเลือก (ธรรมดา / เฉพาะ options / เฉพาะ subcommands) */
export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface BotCommand {
  data: CommandData;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands = new Collection<string, BotCommand>();

for (const command of [setup, help, top, weekly, shake, play, skip, stop, queue]) {
  commands.set(command.data.name, command);
}
