/**
 * src/utils/commandSync.ts
 * ลงทะเบียน Slash Commands อัตโนมัติเมื่อบอทออนไลน์
 *
 * ทำไมต้องมี: บน Render คำสั่งจะไม่อัปเดตเองถ้าไม่รัน `npm run deploy` ด้วยมือ
 * (start command มีแค่รันบอท) → พอเพิ่มคำสั่งใหม่ เช่น /weekly /shake คำสั่งจะหายไป
 * ไฟล์นี้จึงซิงก์ให้ทุกครั้งที่บูต โดยเทียบกับของเดิมก่อน — ไม่ยิง Discord ถี่เกินจำเป็น
 *
 * หลักการ:
 *   1) ล้างคำสั่งระดับ Global ที่ค้างอยู่ (กันคำสั่งซ้ำกับแบบรายเซิร์ฟเวอร์)
 *   2) เทียบคำสั่งรายเซิร์ฟเวอร์ของทุกดิส → อัปเดตเฉพาะดิสที่ยังไม่มี/ไม่ตรง
 */
import { REST, Routes, type Client } from 'discord.js';
import { commands } from '../commands';
import { loadBotEnv } from './env';

/** รูปแบบคำสั่งที่ Discord ส่งกลับมา (เอาเฉพาะฟิลด์ที่เราใช้เทียบ) */
interface RemoteCommand {
  name: string;
  description: string;
  default_member_permissions?: string | null;
  options?: unknown[];
  type?: number;
}

/** ผลลัพธ์การซิงก์ของ 1 เซิร์ฟเวอร์ */
type GuildSyncResult = 'updated' | 'skipped' | 'failed';

/** สร้างลายนิ้วมือของชุดคำสั่ง — ใช้เทียบว่าต้องอัปเดตหรือไม่ */
function fingerprint(list: RemoteCommand[]): string {
  return JSON.stringify(
    list
      .map((command) => ({
        name: command.name,
        description: command.description,
        default_member_permissions: command.default_member_permissions ?? null,
        options: command.options ?? [],
        type: command.type ?? 1,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

/** คำสั่งทั้งหมดในรูป JSON ที่ Discord API ต้องการ + ตัวช่วยเรียก REST */
function buildPayload(client: Client): { rest: REST; applicationId: string; body: unknown[] } {
  const env = loadBotEnv();
  return {
    rest: new REST().setToken(env.token),
    applicationId: client.application?.id ?? env.clientId,
    body: [...commands.values()].map((command) => command.data.toJSON()),
  };
}

/**
 * ซิงก์คำสั่งของเซิร์ฟเวอร์เดียว — อัปเดตเฉพาะเมื่อไม่ตรงกับโค้ดปัจจุบัน
 * (ใช้ทั้งตอนบูตและตอนบอทถูกเชิญเข้าดิสใหม่)
 */
export async function syncCommandsForGuild(
  client: Client,
  guildId: string,
  guildName = guildId,
): Promise<GuildSyncResult> {
  const { rest, applicationId, body } = buildPayload(client);
  const desired = fingerprint(body as unknown as RemoteCommand[]);

  try {
    const current = (await rest.get(
      Routes.applicationGuildCommands(applicationId, guildId),
    )) as RemoteCommand[];

    if (fingerprint(current) === desired) return 'skipped';

    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
    console.log(`✅ ลงคำสั่งให้เซิร์ฟเวอร์: ${guildName} (${guildId})`);
    return 'updated';
  } catch (error) {
    console.warn(
      `[commands] ลงคำสั่งที่ ${guildName} (${guildId}) ไม่สำเร็จ:`,
      error instanceof Error ? error.message : error,
    );
    return 'failed';
  }
}

/**
 * ซิงก์คำสั่งทั้งหมด (เรียกครั้งเดียวตอน ClientReady)
 * ทำงานแบบไม่บล็อก — ถ้าพลาดจะ log แล้วปล่อยบอททำงานต่อตามปกติ
 */
export async function syncGuildCommands(client: Client, attempt = 0): Promise<void> {
  const { rest, applicationId } = buildPayload(client);

  // ── 1) ล้างคำสั่ง Global ที่ค้าง (ถ้ามี) ─────────────────────────
  try {
    const globalCommands = (await rest.get(
      Routes.applicationCommands(applicationId),
    )) as RemoteCommand[];
    if (globalCommands.length > 0) {
      await rest.put(Routes.applicationCommands(applicationId), { body: [] });
      console.log(`🧹 ล้างคำสั่ง Global ที่ค้าง ${globalCommands.length} รายการแล้ว`);
    }
  } catch (error) {
    console.warn(
      '[commands] ล้างคำสั่ง Global ไม่สำเร็จ (ข้ามไป):',
      error instanceof Error ? error.message : error,
    );
  }

  // ── 2) ซิงก์คำสั่งรายเซิร์ฟเวอร์ให้ทุกดิสที่บอทอยู่ ──────────────
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const guild of client.guilds.cache.values()) {
    const result = await syncCommandsForGuild(client, guild.id, guild.name);
    if (result === 'updated') updated += 1;
    else if (result === 'skipped') skipped += 1;
    else failed += 1;
  }

  console.log(
    `🧰 ซิงก์ Slash Commands แล้ว — อัปเดต ${updated} ดิส, ตรงอยู่แล้ว ${skipped} ดิส` +
      (failed ? `, พลาด ${failed} ดิส (จะลองใหม่ให้อัตโนมัติ)` : ''),
  );

  // ลองใหม่แบบจำกัดรอบ (Discord สะดุดชั่วคราว) — ไม่ให้ลูปไม่จบ
  if (failed > 0 && attempt < 2) {
    setTimeout(() => {
      void syncGuildCommands(client, attempt + 1);
    }, 60_000);
    console.log(`[commands] จะลองซิงก์ซ้ำอีกครั้งใน 60 วินาที (รอบที่ ${attempt + 2}/3)`);
  }
}
