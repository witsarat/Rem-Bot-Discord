/** จัดรูปแบบวันเวลา/ตัวเลขแบบไทย (เขตเวลาไทยเสมอ) */

const dateTimeFormat = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

/** "10 ต.ค. 2569 15:56" — คืน "—" ถ้าไม่มีข้อมูล */
export function formatDateTimeTH(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormat.format(date);
}

/** ตัวเลขคั่นหลักพันแบบไทย */
export function formatNumberTH(value: number): string {
  return value.toLocaleString("th-TH");
}

/** ระยะเวลาแบบไทยสั้น ๆ: "2 ชม. 15 น." / "45 น." / "12 วิ" */
export function formatDurationTH(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} ชม. ${minutes} น.`;
  if (minutes > 0) return `${minutes} น.`;
  return `${seconds} วิ`;
}
