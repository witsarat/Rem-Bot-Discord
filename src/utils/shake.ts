/**
 * src/utils/shake.ts
 * ระบบเขย่า (Shake) — ย้ายสมาชิกไปมาระหว่างสองห้องเสียง เพื่อเรียก/ปลุกให้รู้ตัว
 *
 * - จำนวนครั้ง "คงที่": 5 ครั้ง (1 ครั้ง = ย้ายออกไปห้องสลับ แล้วย้ายกลับ)
 *   → รวม 10 การย้าย และจบที่ "ห้องเดิม" ของสมาชิกเสมอ (ไม่ต้องเลือกห้องปลายทาง)
 * - ห้องที่ใช้สลับเลือกให้อัตโนมัติ: AFK channel ก่อน → ห้องเสียงว่าง → ห้องเสียงอื่น
 * - ดีเลย์ระหว่างแต่ละครั้งกำหนดได้ (SHAKE_MIN_DELAY_MS – SHAKE_MAX_DELAY_MS, ค่าเริ่มต้น SHAKE_DEFAULT_DELAY_MS)
 * - ระหว่างถูกเขย่า การย้ายจะไม่ถูกบันทึกเป็น voice log (กัน log รก)
 */
import { ChannelType, Guild, GuildMember, VoiceBasedChannel } from 'discord.js';

/** จำนวนครั้งที่เขย่า (คงที่ — ห้ามตั้งค่า): 1 ครั้ง = ย้ายออก + ย้ายกลับ */
export const SHAKE_ROUNDS = 5;

/** จำนวนการย้ายทั้งหมดที่ใช้จริง (ออก-กลับ × จำนวนครั้ง) */
export const SHAKE_TOTAL_MOVES = SHAKE_ROUNDS * 2;

/** ดีเลย์เริ่มต้นระหว่างการย้าย (มิลลิวินาที) */
export const SHAKE_DEFAULT_DELAY_MS = 800;
/** ดีเลย์ต่ำสุดที่อนุญาต */
export const SHAKE_MIN_DELAY_MS = 300;
/** ดีเลย์สูงสุดที่อนุญาต */
export const SHAKE_MAX_DELAY_MS = 3000;

/** ระยะผ่อนผันหลังเขย่าเสร็จ (รออีเวนต์สุดท้ายจาก Discord ก่อนเลิกกัน log) */
const SUPPRESS_GRACE_MS = 3000;

/** สมาชิกที่กำลังถูกเขย่า (หรือเพิ่งเขย่าเสร็จในช่วงผ่อนผัน) — voiceStateUpdate จะข้ามการบันทึก */
const shakingUsers = new Set<string>();

/** กำลังถูกเขย่าอยู่ไหม (ใช้โดย voiceStateUpdate เพื่อข้ามการบันทึก log) */
export function isBeingShaken(userId: string): boolean {
  return shakingUsers.has(userId);
}

export interface ShakeResult {
  /** ย้ายสำเร็จกี่ครั้ง */
  moved: number;
  /** ย้ายไม่สำเร็จกี่ครั้ง */
  failed: number;
}

/**
 * เลือก "ห้องสลับ" ให้อัตโนมัติ (ไม่ใช่ห้องปัจจุบันของสมาชิก)
 * ลำดับความสำคัญ: AFK channel → ห้องเสียงที่ไม่มีคนอยู่ → ห้องเสียงอื่น ๆ
 * @returns หมายเลขห้อง หรือ null ถ้าเซิร์ฟเวอร์ไม่มีห้องเสียงอื่นเลย
 */
export function pickBounceChannel(guild: Guild, currentChannelId: string): VoiceBasedChannel | null {
  const afk = guild.afkChannel;
  if (afk && afk.id !== currentChannelId) return afk;

  const others = [...guild.channels.cache.values()].filter(
    (channel): channel is VoiceBasedChannel =>
      channel.type === ChannelType.GuildVoice && channel.id !== currentChannelId,
  );

  return others.find((channel) => channel.members.size === 0) ?? others[0] ?? null;
}

/**
 * เขย่าสมาชิก: สลับระหว่างห้องปัจจุบัน (startChannelId) กับห้องสลับ (bounceChannelId)
 * ย้ายออก-กลับครบตามจำนวนคงที่ → จบที่ห้องเดิมเสมอ
 * (มีขั้น "กลับห้องเดิม" สำรองไว้ด้วย เผื่อมีการย้ายพลาดกลางทาง)
 */
export async function shakeMember(
  member: GuildMember,
  startChannelId: string,
  bounceChannelId: string,
  delayMs: number,
): Promise<ShakeResult> {
  const delay = Math.min(Math.max(Math.round(delayMs), SHAKE_MIN_DELAY_MS), SHAKE_MAX_DELAY_MS);
  const result: ShakeResult = { moved: 0, failed: 0 };

  shakingUsers.add(member.id);
  try {
    let currentChannelId = startChannelId;

    const move = async (channelId: string): Promise<void> => {
      try {
        await member.voice.setChannel(channelId);
        result.moved += 1;
        currentChannelId = channelId;
      } catch (error) {
        result.failed += 1;
        console.error(`[shake] ย้ายสมาชิก ${member.id} ไม่สำเร็จ:`, error);
      }
    };

    // ไป-กลับสลับกัน: ออก (ห้องสลับ) → กลับ (ห้องเดิม) × จำนวนครั้ง
    for (let i = 0; i < SHAKE_TOTAL_MOVES; i += 1) {
      const nextChannelId = i % 2 === 0 ? bounceChannelId : startChannelId;
      await move(nextChannelId);
      if (i < SHAKE_TOTAL_MOVES - 1) await sleep(delay); // หน่วงระหว่างครั้ง (ไม่หน่วงหลังครั้งสุดท้าย)
    }

    // สำรอง: ถ้ามีการย้ายพลาดกลางทางจนหลุดตำแหน่ง → ย้ายกลับห้องเดิมให้แน่ใจ
    if (currentChannelId !== startChannelId) {
      await move(startChannelId);
    }
  } finally {
    // เลิกกัน log แบบหน่วงเวลา — เผื่ออีเวนต์ล่าสุดจาก Discord มาถึงช้า
    setTimeout(() => shakingUsers.delete(member.id), SUPPRESS_GRACE_MS);
  }

  return result;
}

/** หน่วงเวลาแบบ Promise */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
