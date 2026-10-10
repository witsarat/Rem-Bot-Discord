/**
 * src/utils/spotify.ts
 * แปลงลิงก์ Spotify (เพลง / อัลบั้ม / เพลย์ลิสต์) → รายการชื่อเพลง
 *
 * ⚠️ หมายเหตุสำคัญ: Spotify ไม่ให้สตรีมเสียงผ่าน API แก่บุคคลที่สาม
 *    ระบบนี้จึงดึงแค่ "ข้อมูลเพลง" แล้วนำชื่อไปเล่นเวอร์ชันเดียวกันจาก YouTube
 *    (วิธีมาตรฐานของบอทเพลงทุกตัว)
 *
 * ตั้งค่า: SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET จาก https://developer.spotify.com
 */
const SPOTIFY_URL_RE = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/;

/** เพลง 1 รายการจาก Spotify (ข้อมูลเท่านั้น) */
export interface SpotifyTrackRef {
  title: string;
  artist: string;
}

/** มีการตั้งค่า Spotify หรือยัง */
export function isSpotifyConfigured(): boolean {
  return Boolean(
    (process.env.SPOTIFY_CLIENT_ID ?? '').trim() && (process.env.SPOTIFY_CLIENT_SECRET ?? '').trim(),
  );
}

/** แกะลิงก์ Spotify → ประเภท + ID */
export function parseSpotifyUrl(input: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
  const match = SPOTIFY_URL_RE.exec(input.trim());
  if (!match) return null;
  return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

/** ขอ access token แบบ client credentials (แคชไว้จนหมดอายุ) */
async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const clientId = (process.env.SPOTIFY_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET ?? '').trim();
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`ขอ token Spotify ไม่สำเร็จ (HTTP ${res.status}) — ตรวจ SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/** ยิง API ของ Spotify */
async function apiGet(pathname: string): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`https://api.spotify.com/v1${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API ตอบ HTTP ${res.status}`);
  return res.json();
}

/** จำนวนเพลงสูงสุดที่ดึงจาก Spotify ต่อครั้ง (กันแรม/CPU บนฟรีไทร์) */
export const SPOTIFY_MAX_TRACKS = 25;

function toRef(track: unknown): SpotifyTrackRef | null {
  const item = track as { name?: string; artists?: Array<{ name?: string }> } | null;
  if (!item?.name) return null;
  return {
    title: String(item.name),
    artist: (item.artists ?? []).map((a) => a.name ?? '').join(', '),
  };
}

/** ดึงรายการเพลงจากลิงก์ Spotify — track / album / playlist สูงสุด SPOTIFY_MAX_TRACKS เพลง */
export async function resolveSpotifyTracks(url: string, max = SPOTIFY_MAX_TRACKS): Promise<SpotifyTrackRef[]> {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) throw new Error('ลิงก์ Spotify ไม่ถูกต้อง');

  if (parsed.type === 'track') {
    const data = (await apiGet(`/tracks/${parsed.id}`)) as unknown;
    const ref = toRef(data);
    if (!ref) throw new Error('ไม่พบข้อมูลเพลงนี้');
    return [ref];
  }

  if (parsed.type === 'album') {
    const data = (await apiGet(`/albums/${parsed.id}/tracks?limit=50`)) as { items?: unknown[] };
    return (data.items ?? [])
      .map(toRef)
      .filter((ref): ref is SpotifyTrackRef => ref !== null)
      .slice(0, max);
  }

  // เพลย์ลิสต์ — ดึงทีละหน้า (สูงสุด max เพลง)
  const refs: SpotifyTrackRef[] = [];
  let offset = 0;
  while (refs.length < max) {
    let data: { items?: unknown[]; next?: string | null };
    try {
      // endpoint ใหม่ (/items) ก่อน — ถ้าไม่รองรับจะถอยไปใช้ /tracks
      data = (await apiGet(`/playlists/${parsed.id}/items?limit=50&offset=${offset}`)) as typeof data;
    } catch {
      data = (await apiGet(`/playlists/${parsed.id}/tracks?limit=50&offset=${offset}`)) as typeof data;
    }
    const items = data.items ?? [];
    if (!items.length) break;
    for (const item of items) {
      const wrapped = item as { item?: unknown; track?: unknown } | null;
      const ref = toRef(wrapped?.item ?? wrapped?.track ?? null);
      if (ref) refs.push(ref);
      if (refs.length >= max) break;
    }
    if (!data.next) break;
    offset += 50;
  }

  if (!refs.length) throw new Error('เพลย์ลิสต์ว่าง หรือเข้าถึงไม่ได้ (ต้องเป็นเพลย์ลิสต์สาธารณะ)');
  return refs;
}
