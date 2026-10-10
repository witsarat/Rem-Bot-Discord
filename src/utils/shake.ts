/**
 * src/utils/shake.ts
 * ระบบเขย่า (Shake) — ย้ายสมาชิกไปมาระหว่างสองห้องเสียง เพื่อเรียก/ปลุกให้รู้ตัว
 *
 * - จำนวนครั้ง "คงที่" (SHAKE_MOVES = 7 ครั้ง) — จงใจไม่ให้กำหนด
 *   (เป็นเลขคี่ → ย้ายสลับไปมาแล้วจบที่ "ห้องปลายทาง" เสมอ)
 * - ดีเลย์ระหว่างแต่ละครั้งกำหนดได้ (SHAKE_MIN_DELAY_MS – SHAKE_MAX_DELAY_MS, ค่าเริ่มต้น SHAKE_DEFAULT_DELAY_MS)
 * - ระหว่างถูกเขย่า การย้ายจะไม่ถูกบันทึกเป็น voice log (กัน log รก)
 *   และมีช่วงผ่อนผันหลังเขย่าเสร็จ เผื่ออีเวนต์ล่าสุดจาก Discord มาถึงช้า
 */
import { GuildMember } from 'discord.js';

/** จำนวนครั้งที่ย้ายต่อการเขย่า 1 ครั้ง (คงที่ — ห้ามตั้งค่า) */
export const SHAKE_MOVES = 7;

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
 * เขย่าสมาชิก: สลับไประหว่างห้องปัจจุบัน (startChannelId) กับห้องปลายทาง (targetChannelId)
 * จบแล้ว (ถ้าย้ายสำเร็จครบ) สมาชิกจะอยู่ที่ห้องปลายทาง
 */
export async function shakeMember(
  member: GuildMember,
  startChannelId: string,
  targetChannelId: string,
  delayMs: number,
): Promise<ShakeResult> {
  const delay = Math.min(Math.max(Math.round(delayMs), SHAKE_MIN_DELAY_MS), SHAKE_MAX_DELAY_MS);
  const result: ShakeResult = { moved: 0, failed: 0 };

  shakingUsers.add(member.id);
  try {
    let currentChannelId = startChannelId;
    for (let i = 0; i < SHAKE_MOVES; i += 1) {
      const nextChannelId = currentChannelId === startChannelId ? targetChannelId : startChannelId;
      try {
        await member.voice.setChannel(nextChannelId);
        result.moved += 1;
        currentChannelId = nextChannelId;
      } catch (error) {
        result.failed += 1;
        console.error(`[shake] ย้ายสมาชิก ${member.id} ไม่สำเร็จ:`, error);
      }
      if (i < SHAKE_MOVES - 1) await sleep(delay); // หน่วงระหว่างครั้ง (ไม่หน่วงหลังครั้งสุดท้าย)
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
