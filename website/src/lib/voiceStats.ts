/**
 * คำนวณอันดับเวลาอยู่ห้องเสียงจากตาราง voice_logs (ฝั่งเว็บไซต์)
 * - จับคู่ join → leave เป็นราย "session" ต่อผู้ใช้; move ไม่นับ (เวลาไม่ขาด)
 * - session ที่ยังไม่ปิด (ไม่มี leave) ยังไม่ถูกนับ
 * - rows ต้องเรียงจากเก่า → ใหม่ (query จัดให้แล้ว)
 */
import type { VoiceStatEventRow } from "./db";

export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalMs: number;
  joins: number;
}

export function computeVoiceLeaderboard(rows: VoiceStatEventRow[]): LeaderboardEntry[] {
  interface PlayerState {
    username: string;
    totalMs: number;
    joins: number;
    openStart: number | null;
  }

  const players = new Map<string, PlayerState>();

  for (const row of rows) {
    let player = players.get(row.user_id);
    if (!player) {
      player = { username: row.username, totalMs: 0, joins: 0, openStart: null };
      players.set(row.user_id, player);
    }
    player.username = row.username;
    const timestamp = row.created_at.getTime();

    if (row.event === "join") {
      player.joins += 1;
      player.openStart = timestamp;
    } else if (row.event === "leave") {
      if (player.openStart !== null) {
        const duration = timestamp - player.openStart;
        if (duration > 0) player.totalMs += duration;
        player.openStart = null;
      }
    }
    // move → ไม่นับ
  }

  return Array.from(players.entries())
    .map(([userId, player]) => ({
      userId,
      username: player.username,
      totalMs: player.totalMs,
      joins: player.joins,
    }))
    .filter((entry) => entry.totalMs > 0)
    .sort((a, b) => b.totalMs - a.totalMs);
}
