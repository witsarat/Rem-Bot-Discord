"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadGuildAccess } from "@/lib/auth";
import { upsertGuildSettings } from "@/lib/db";

function normalizeChannelId(value: FormDataEntryValue | null): string | null | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (!/^\d{17,20}$/.test(raw)) return "invalid";
  return raw;
}

/** บันทึกค่าห้อง (log + รายงานประจำสัปดาห์) — ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทุกครั้ง */
export async function saveSettings(formData: FormData): Promise<void> {
  const guildId = String(formData.get("guild_id") ?? "").trim();
  if (!/^\d{17,20}$/.test(guildId)) redirect("/dashboard");

  const logChannel = normalizeChannelId(formData.get("log_channel"));
  const weeklyChannel = normalizeChannelId(formData.get("weekly_channel"));
  if (logChannel === "invalid" || weeklyChannel === "invalid") {
    redirect(`/dashboard/${guildId}?error=invalid`);
  }

  // สำคัญ: อย่าเชื่อ UI — ตรวจสิทธิ์จริงจากฝั่งเซิร์ฟเวอร์เสมอ
  const access = await loadGuildAccess(guildId);
  if (!access.ok) {
    redirect(`/dashboard/${guildId}?error=auth`);
  }

  try {
    await upsertGuildSettings(guildId, logChannel, weeklyChannel);
  } catch (error) {
    console.error("[dashboard] บันทึกค่าไม่สำเร็จ:", error);
    redirect(`/dashboard/${guildId}?error=save`);
  }

  revalidatePath(`/dashboard/${guildId}`);
  redirect(`/dashboard/${guildId}?saved=1`);
}
