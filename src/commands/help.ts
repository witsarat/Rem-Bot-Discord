/**
 * src/commands/help.ts
 * คำสั่ง /help — คู่มือแบบแบ่งหน้า (ephemeral)
 *
 *  - แบ่งเป็น 5 หมวด: ภาพรวม / จัดการเซิร์ฟเวอร์ / สถิติ / รายงาน / แพ็กเกจ
 *  - เปลี่ยนหน้าได้ด้วยเมนูเลือกหมวด หรือปุ่ม ◀ ▶ (มีปุ่มปิดเมนู)
 *  - หน้าแรกแนบภาพแบนเนอร์ (assets/help-banner.jpg) เข้า embed โดยตรง
 */
import fs from 'fs';
import path from 'path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('แสดงคู่มือการใช้งานบอท แบ่งหมวดหมู่ เลือกดูได้');

const BRAND = 0xff8c42;
const COLLECTOR_MS = 180_000;

interface HelpCategory {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  title: string;
  description: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  image?: boolean;
}

const CATEGORIES: HelpCategory[] = [
  {
    id: 'overview',
    label: 'ภาพรวม',
    emoji: '📖',
    hint: 'บอททำอะไรได้บ้าง + เริ่มใช้งาน',
    title: '📖 Ruru — บันทึกห้องเสียงอัตโนมัติ',
    description: [
      'บอทจะคอยบันทึก **เข้า–ออก–ย้ายห้องเสียง** ของสมาชิก แล้วส่งเป็น embed ไปยังห้อง `voice-logs`',
      'เรียกดูสถิติได้ด้วย `/top` และ `/profile` • ตั้งรายงานอัตโนมัติได้ด้วย `/weekly`',
    ].join('\n'),
    fields: [
      {
        name: '🎨 ความหมายของสีในห้อง log',
        value: [
          '🟢 **เขียว** — เข้าห้องเสียง (Join)',
          '🔴 **แดง** — ออกจากห้องเสียง (Leave)',
          '🟡 **เหลือง** — ย้ายห้องเสียง (Move)',
        ].join('\n'),
        inline: true,
      },
      {
        name: '⚡ เริ่มใช้งาน 3 ขั้น',
        value: [
          '1. `/setup` — สร้างห้อง `voice-logs` (ผู้ดูแล)',
          '2. `/weekly set` — ตั้งห้องรับรายงาน (ถ้าต้องการ)',
          '3. `/top` หรือ `/profile` — ดูสถิติได้ทันที',
        ].join('\n'),
        inline: true,
      },
      {
        name: '💡 หมายเหตุ',
        value: [
          '• ไม่บันทึกการเคลื่อนไหวของบอทด้วยกันเอง',
          '• เปิด/ปิดไมค์หรือกล้อง ไม่ถือเป็นการเข้า–ออกห้อง',
          '• `/top` และ `/weekly` ต้องเปิดฐานข้อมูลออนไลน์ก่อน',
        ].join('\n'),
      },
    ],
    image: true,
  },
  {
    id: 'setup',
    label: 'จัดการเซิร์ฟเวอร์',
    emoji: '🛠️',
    hint: 'setup • shake • ตั้งห้องรายงาน',
    title: '🛠️ จัดการเซิร์ฟเวอร์',
    description: 'คำสั่งกลุ่มนี้ต้องเป็น **ผู้ดูแลเซิร์ฟเวอร์** เท่านั้น',
    fields: [
      {
        name: '⚙️ `/setup`',
        value: 'สร้าง/ตั้งค่าห้อง `voice-logs` (ถ้ามีอยู่แล้วจะใช้ห้องเดิม) แล้วบันทึกค่าแยกตามเซิร์ฟเวอร์',
      },
      {
        name: '🔔 `/shake`',
        value: 'เขย่าเรียกสมาชิก: ย้ายไป–กลับ 5 ครั้งแล้วกลับห้องเดิม • คูลดาวน์ 30 วินาที',
      },
      {
        name: '🗓️ `/weekly set` • `/weekly off`',
        value: 'กำหนด/ปิดห้องรับรายงานประจำสัปดาห์ (ส่งทุกวันจันทร์ 09:00 น. เวลาไทย — เฉพาะ Premium)',
      },
    ],
  },
  {
    id: 'stats',
    label: 'สถิติและโปรไฟล์',
    emoji: '📊',
    hint: 'top • profile',
    title: '📊 สถิติและโปรไฟล์',
    description: 'ข้อมูลทั้งหมดดึงจากฐานข้อมูล voice log จริง',
    fields: [
      {
        name: '🏆 `/top`',
        value: [
          'จัดอันดับสมาชิกที่อยู่ในห้องเสียงนานที่สุด (ยอดรวมทุกครั้ง ไม่ใช่ต่อครั้ง)',
          '• เลือกช่วงเวลาได้: 7 วัน / 30 วัน / ทั้งหมด (ทั้งกาล = Premium)',
          '• ระบุสมาชิกเพื่อดูอันดับของคนนั้นได้',
        ].join('\n'),
      },
      {
        name: '🎧 `/profile [สมาชิก]`',
        value: [
          'การ์ดสมาชิกเป็นรูปภาพ: เวลา 7 วัน / 30 วัน / สะสมทั้งหมด, อันดับ, ห้องยอดนิยม',
          '• ใช้ `username` เป็นชื่อบนการ์ด • ธีมการ์ดเลือกได้ 16 แบบจากแดชบอร์ด',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'weekly',
    label: 'รายงานประจำสัปดาห์',
    emoji: '🗓️',
    hint: 'weekly set / now / off',
    title: '🗓️ รายงานประจำสัปดาห์',
    description: 'สรุป Top 5 ผู้ใช้งานห้องเสียง + เวลารวม + ห้องยอดนิยม',
    fields: [
      {
        name: 'คำสั่ง',
        value: [
          '`/weekly set` — ตั้งห้องรับรายงาน (ผู้ดูแล)',
          '`/weekly now` — ส่งรายงานทดสอบทันที',
          '`/weekly off` — ปิดรายงานอัตโนมัติ',
        ].join('\n'),
      },
      {
        name: '⭐ ความต่างตามแพ็กเกจ',
        value: [
          '**ฟรี** — ตั้งห้องได้ และส่งทดสอบเองได้ (เป็น embed)',
          '**Premium** — ส่งอัตโนมัติทุกวันจันทร์ 09:00 น. เป็นการ์ดรูปภาพ',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'premium',
    label: 'แพ็กเกจ & ราคา',
    emoji: '⭐',
    hint: 'ฟรี vs Premium 29 บาท',
    title: '⭐ แพ็กเกจการใช้งาน',
    description: 'Premium ราคา **29 บาท/เดือน ต่อ 1 เซิร์ฟเวอร์** (รอบละ 30 วัน)',
    fields: [
      {
        name: 'ฟรี',
        value: [
          '• บันทึก log ไม่จำกัด',
          '• `/top` 7 วัน / 30 วัน',
          '• `/profile` การ์ดเต็มรูปแบบ',
          '• ประวัติแดชบอร์ด 30 วัน',
          '• Role rewards 1 เกณฑ์',
        ].join('\n'),
        inline: true,
      },
      {
        name: '⭐ Premium',
        value: [
          '• `/top` ทั้งหมด (ตลอดกาล)',
          '• รายงานอัตโนมัติทุกจันทร์ 09:00',
          '• ประวัติเต็ม + ส่งออก CSV',
          '• Role rewards ไม่จำกัดเกณฑ์',
          '• การ์ด Weekly เป็นภาพ',
        ].join('\n'),
        inline: true,
      },
      {
        name: 'คำสั่ง',
        value: '`/premium status` • `/premium features` — ดูสถานะและตารางเทียบ\nเปิดใช้โดยเจ้าของบอท: `/premium grant`',
      },
    ],
  },
];

// ── ภาพแบนเนอร์ (อ่านครั้งเดียว) ──────────────────────────────
let bannerCache: Buffer | null | undefined;

function banner(): Buffer | null {
  if (bannerCache !== undefined) return bannerCache;
  try {
    bannerCache = fs.readFileSync(path.join(process.cwd(), 'assets', 'help-banner.jpg'));
  } catch {
    bannerCache = null;
    console.warn('[help] ไม่พบ assets/help-banner.jpg — จะแสดง embed โดยไม่มีภาพ');
  }
  return bannerCache;
}

export const HELP_PAGE_COUNT = CATEGORIES.length;

/** สร้างเนื้อหาหน้า help (แยกออกมาเพื่อทดสอบได้โดยไม่ต้องมี Discord) */
export function buildHelpPage(index: number): {
  embed: EmbedBuilder;
  components: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>>;
  files: AttachmentBuilder[];
  page: number;
  total: number;
} {
  const page = Math.min(CATEGORIES.length - 1, Math.max(0, index));
  const category = CATEGORIES[page];

  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(category.title)
    .setDescription(category.description)
    .addFields(category.fields)
    .setFooter({ text: `Ruru Help · หน้า ${page + 1}/${CATEGORIES.length} — เลือกหมวดหรือกด ◀ ▶` })
    .setTimestamp();

  const files: AttachmentBuilder[] = [];
  const image = category.image ? banner() : null;
  if (image) {
    embed.setImage('attachment://help-banner.jpg');
    files.push(new AttachmentBuilder(image, { name: 'help-banner.jpg' }));
  } else {
    embed.setThumbnail(null);
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('help:select')
    .setPlaceholder('เลือกหมวดหมู่')
    .addOptions(
      CATEGORIES.map((item, i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.label)
          .setValue(String(i))
          .setEmoji(item.emoji)
          .setDescription(item.hint)
          .setDefault(i === page),
      ),
    );

  const prev = new ButtonBuilder()
    .setCustomId('help:prev')
    .setLabel('ก่อนหน้า')
    .setEmoji('◀️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const next = new ButtonBuilder()
    .setCustomId('help:next')
    .setLabel('ถัดไป')
    .setEmoji('▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === CATEGORIES.length - 1);

  const close = new ButtonBuilder()
    .setCustomId('help:close')
    .setLabel('ปิด')
    .setEmoji('✖️')
    .setStyle(ButtonStyle.Danger);

  return {
    embed,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next, close),
    ],
    files,
    page,
    total: CATEGORIES.length,
  };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  let index = 0;
  const first = buildHelpPage(index);

  await interaction.reply({
    embeds: [first.embed],
    components: first.components,
    files: first.files,
    flags: MessageFlags.Ephemeral,
  });

  const message = await interaction.fetchReply();

  const collector = message.createMessageComponentCollector({ time: COLLECTOR_MS });

  collector.on('collect', async (component) => {
    if (component.user.id !== interaction.user.id) {
      await component
        .reply({ content: 'เมนูนี้เป็นของผู้ที่พิมพ์ `/help` — เปิดเมนูของตัวเองด้วย `/help` นะ', flags: MessageFlags.Ephemeral })
        .catch(() => null);
      return;
    }

    if (component.customId === 'help:close') {
      await component.update({ components: [] }).catch(() => null);
      collector.stop('closed');
      return;
    }

    if (component.customId === 'help:select' && component.isStringSelectMenu()) {
      index = Number(component.values[0]) || 0;
    } else if (component.customId === 'help:prev') {
      index = Math.max(0, index - 1);
    } else if (component.customId === 'help:next') {
      index = Math.min(CATEGORIES.length - 1, index + 1);
    }

    const page = buildHelpPage(index);
    await component
      .update({ embeds: [page.embed], components: page.components, files: page.files })
      .catch((error) => console.warn('[help] อัปเดตหน้าไม่สำเร็จ:', error));
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'closed') return;
    // หมดเวลา → ปิดปุ่มทั้งหมด กันกดแล้วไม่ตอบสนอง
    await message
      .edit({
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('help:select')
              .setPlaceholder('เมนูหมดอายุ — พิมพ์ /help ใหม่')
              .setDisabled(true)
              .addOptions(
                CATEGORIES.map((item, i) =>
                  new StringSelectMenuOptionBuilder().setLabel(item.label).setValue(String(i)).setEmoji(item.emoji),
                ),
              ),
          ),
        ],
      })
      .catch(() => null);
  });
}
