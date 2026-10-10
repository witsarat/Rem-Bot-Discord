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
