/**
 * test-shake.ts — ทดสอบตรรกะระบบเขย่า (mock — ไม่ยิง Discord จริง)
 * รันด้วย: npx tsx test-shake.ts
 */
import { GuildMember } from 'discord.js';
import { isBeingShaken, SHAKE_MOVES, shakeMember } from './src/utils/shake';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  // ── ทดสอบ 1: เขย่าปกติ A↔B จำนวนคงที่ จบที่ B + กัน log ระหว่างเขย่า ──
  const calls: string[] = [];
  const suppressedDuringMoves: boolean[] = [];
  const mockMember = {
    id: '900000000000000999',
    voice: {
      setChannel: async (channelId: string): Promise<void> => {
        calls.push(channelId);
        suppressedDuringMoves.push(isBeingShaken('900000000000000999'));
      },
    },
  } as unknown as GuildMember;

  const result = await shakeMember(mockMember, 'A', 'B', 300);
  check('ย้ายครบตามจำนวนคงที่', calls.length === SHAKE_MOVES, `ได้ ${calls.length} ครั้ง (ต้องได้ ${SHAKE_MOVES})`);
  check('สลับถูกต้อง จบที่ห้องปลายทาง B', calls.join(',') === 'B,A,B,A,B,A,B', calls.join(','));
  check('นับผลสำเร็จถูกต้อง', result.moved === SHAKE_MOVES && result.failed === 0, JSON.stringify(result));
  check('ระหว่างย้าย "ถูกกัน log" ทุกครั้ง', suppressedDuringMoves.length === SHAKE_MOVES && suppressedDuringMoves.every(Boolean));
  check('ทันทีที่เสร็จยังกัน log ต่อ (ช่วงผ่อนผัน)', isBeingShaken('900000000000000999'));

  await new Promise((resolve) => setTimeout(resolve, 3500));
  check('หลังช่วงผ่อนผัน → เลิกกัน log', !isBeingShaken('900000000000000999'));

  // ── ทดสอบ 2: ย้ายล้มเหลวกลางทาง → นับ failed และไปต่อได้ ──
  let count = 0;
  const flaky = {
    id: '900000000000000888',
    voice: {
      setChannel: async (): Promise<void> => {
        count += 1;
        if (count === 3) throw new Error('mock fail');
      },
    },
  } as unknown as GuildMember;

  const result2 = await shakeMember(flaky, 'A', 'B', 300);
  check('ล้มเหลว 1 ครั้ง → failed = 1', result2.failed === 1, JSON.stringify(result2));
  check('สำเร็จที่เหลือ 6 ครั้ง → moved = 6', result2.moved === 6, JSON.stringify(result2));

  // ── ทดสอบ 3: ดีเลย์ต่ำกว่าขั้นต่ำ → ถูก clamp แล้วยังย้ายครบ ──
  const calls3: string[] = [];
  const clamped = {
    id: '900000000000000777',
    voice: {
      setChannel: async (channelId: string): Promise<void> => {
        calls3.push(channelId);
      },
    },
  } as unknown as GuildMember;

  await shakeMember(clamped, 'A', 'B', 50);
  check('ดีเลย์ต่ำเกิน → clamp แล้วยังย้ายครบ', calls3.length === SHAKE_MOVES, `ได้ ${calls3.length}`);

  console.log('');
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
