/**
 * src/commands/help.ts
 * คำสั่ง /help — แสดงคู่มือการใช้งานบอทเป็น Embed Message
 * (ephemeral = เห็นเฉพาะคนที่พิมพ์คำสั่งเท่านั้น)
 */
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('แสดงคู่มือการใช้งานบอท คำสั่งทั้งหมด และความหมายของสีต่างๆ');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📖 คู่มือการใช้งาน Voice Log Bot')
    .setDescription(
      'บอทจะคอยบันทึกการ **เข้า-ออก-ย้ายห้องเสียง** ของสมาชิกในเซิร์ฟเวอร์\n' +
        'แล้วส่งเป็นข้อความ Embed ไปยังห้อง `voice-logs` โดยอัตโนมัติ',
    )
    .addFields(
      {
        name: '🧰 คำสั่งทั้งหมด',
        value: [
          '`/setup` — สร้าง/ตั้งค่าห้อง `voice-logs` และบันทึกค่าไว้ **(ผู้ดูแลเซิร์ฟเวอร์เท่านั้น)**',
          '`/help` — แสดงคู่มือนี้',
          '`/top` — 🏆 จัดอันดับสมาชิกที่อยู่ในห้องเสียงนานที่สุด (ดึงจากฐานข้อมูล)',
          '`/weekly set` / `off` / `now` — 🗓️ ตั้งค่าห้องรับรายงานประจำสัปดาห์ / ปิด / ส่งทดสอบ (ผู้ดูแล)',
          '`/shake` — 🔔 เขย่าเรียกสมาชิก (ย้ายไป-กลับ 5 ครั้ง แล้วกลับห้องเดิม กำหนดดีเลย์ได้) **(ผู้ดูแลเท่านั้น)**',
        ].join('\n'),
      },
      {
        name: '🎨 ความหมายของสีสถานะ',
        value: [
          '🟢 **สีเขียว (Join)** — มีสมาชิกเข้าห้องเสียง',
          '🔴 **สีแดง (Leave)** — มีสมาชิกออกจากห้องเสียง',
          '🟡 **สีเหลือง (Move)** — มีสมาชิกย้ายห้องเสียง',
        ].join('\n'),
      },
      {
        name: '💡 หมายเหตุ',
        value: [
          '• บอทจะไม่บันทึกการเคลื่อนไหวของบอทด้วยกันเอง',
          '• การปิด/เปิดไมค์ หรือเปิด/ปิดกล้อง ไม่ถือเป็นการเข้า-ออกห้อง จึงไม่ถูกบันทึก',
          '• ถ้ายังไม่เห็นข้อความ log ให้ผู้ดูแลรัน `/setup` ก่อน',
          '• คำสั่ง `/top` และ `/weekly` ต้องเปิดใช้ฐานข้อมูลออนไลน์ก่อน (ดู README หัวข้อฐานข้อมูล)',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Voice Log Bot • พัฒนาด้วย discord.js v14' })
    .setTimestamp();

  // ephemeral = เห็นเฉพาะคนที่พิมพ์คำสั่ง
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
