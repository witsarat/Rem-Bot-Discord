/**
 * test-shake.ts — ทดสอบตรรกะระบบเขย่า (mock — ไม่ยิง Discord จริง)
 * รันด้วย: npx tsx test-shake.ts
 */
import { ChannelType, Guild, GuildMember } from 'discord.js';
import {
  clearShakeCooldown,
  isBeingShaken,
  pickBounceChannel,
  SHAKE_COOLDOWN_MS,
  SHAKE_ROUNDS,
  SHAKE_TOTAL_MOVES,
  shakeCooldownRemaining,
  shakeMember,
  startShakeCooldown,
} from './src/utils/shake';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  // ── ทดสอบ 1: เขย่าปกติ A↔B — 5 ครั้ง (ไป-กลับ) จบที่ A (ห้องเดิม) + กัน log ──
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
  check(
    `ย้ายครบ ${SHAKE_TOTAL_MOVES} ครั้ง (${SHAKE_ROUNDS} ครั้ง × ไป-กลับ)`,
    calls.length === SHAKE_TOTAL_MOVES,
    `ได้ ${calls.length}`,
  );
  check('สลับถูกต้อง', calls.join(',') === 'B,A,B,A,B,A,B,A,B,A', calls.join(','));
  check('จบที่ห้องเดิม A เสมอ', calls[calls.length - 1] === 'A');
  check('นับผลสำเร็จถูกต้อง', result.moved === SHAKE_TOTAL_MOVES && result.failed === 0, JSON.stringify(result));
  check(
    'ระหว่างย้าย "ถูกกัน log" ทุกครั้ง',
    suppressedDuringMoves.length === SHAKE_TOTAL_MOVES && suppressedDuringMoves.every(Boolean),
  );
  check('ทันทีที่เสร็จยังกัน log ต่อ (ช่วงผ่อนผัน)', isBeingShaken('900000000000000999'));

  await new Promise((resolve) => setTimeout(resolve, 3500));
  check('หลังช่วงผ่อนผัน → เลิกกัน log', !isBeingShaken('900000000000000999'));

  // ── ทดสอบ 2: ย้ายครั้งสุดท้ายล้มเหลว → มีขั้น "กลับห้องเดิม" สำรองทำงาน ──
  let count = 0;
  const flakyCalls: string[] = [];
  const flaky = {
    id: '900000000000000888',
    voice: {
      setChannel: async (channelId: string): Promise<void> => {
        count += 1;
        if (count === SHAKE_TOTAL_MOVES) throw new Error('mock fail'); // ล้มเหลวที่ครั้งสุดท้ายของลูป
        flakyCalls.push(channelId);
      },
    },
  } as unknown as GuildMember;

  const result2 = await shakeMember(flaky, 'A', 'B', 300);
  check('ล้มเหลว 1 ครั้ง → failed = 1', result2.failed === 1, JSON.stringify(result2));
  check('สำเร็จ 10 ครั้ง (9 + กลับห้องสำรอง)', result2.moved === 10, JSON.stringify(result2));
  check('ขั้นสำรองย้ายกลับห้องเดิม A สำเร็จ', flakyCalls[flakyCalls.length - 1] === 'A', flakyCalls.join(','));

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
  check('ดีเลย์ต่ำเกิน → clamp แล้วยังย้ายครบ', calls3.length === SHAKE_TOTAL_MOVES, `ได้ ${calls3.length}`);

  // ── ทดสอบ 4: การเลือกห้องสลับอัตโนมัติ ──
  const fakeGuild = (afk: unknown, chans: unknown[]): Guild =>
    ({
      afkChannel: afk,
      channels: { cache: new Map((chans as Array<{ id: string }>).map((c) => [c.id, c])) },
    }) as unknown as Guild;
  const voice = (id: string, empty: boolean): unknown => ({
    id,
    type: ChannelType.GuildVoice,
    members: { size: empty ? 0 : 3 },
  });

  check(
    'มี AFK channel → เลือก AFK ก่อน',
    pickBounceChannel(fakeGuild(voice('afk', true), [voice('x', true)]), 'cur')?.id === 'afk',
  );
  check(
    'ไม่มี AFK → เลือกห้องเสียงว่างก่อน',
    pickBounceChannel(fakeGuild(null, [voice('a', false), voice('b', true)]), 'cur')?.id === 'b',
  );
  check(
    'มีห้องเดียว (ห้องตัวเอง) → คืน null',
    pickBounceChannel(fakeGuild(null, [voice('a', true)]), 'a') === null,
  );

  // ── ทดสอบ 5: คูลดาวน์รวมต่อเซิร์ฟเวอร์ (กันกดรัว) ──
  const guildKey = 'guild-cooldown-test';
  check('ยังไม่เคยใช้ → ไม่มีคูลดาวน์', shakeCooldownRemaining(guildKey) === 0);
  startShakeCooldown(guildKey);
  const remaining = shakeCooldownRemaining(guildKey);
  check(
    'เริ่มคูลดาวน์แล้ว → เหลือ ~30 วิ',
    remaining > SHAKE_COOLDOWN_MS - 2_000 && remaining <= SHAKE_COOLDOWN_MS,
    `${remaining} ms`,
  );
  clearShakeCooldown(guildKey);
  check('เคลียร์คูลดาวน์ (กรณีเขย่าไม่สำเร็จ) → ใช้ได้ทันที', shakeCooldownRemaining(guildKey) === 0);

  console.log('');
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
