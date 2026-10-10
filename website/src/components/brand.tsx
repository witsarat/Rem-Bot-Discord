/** โลโก้ของเว็บ — สี่เหลี่ยมมุมโค้งสีฟ้า + แถบเสียงสีขาว */

export function RemMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <path
        d="M10.5 13.5v5M16 9.5v13M21.5 12.5v7"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Brand({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <RemMark className="h-8 w-8" />
      <span className="flex flex-col leading-none">
        <span className="text-base font-semibold text-slate-900">Rem</span>
        {subtitle ? <span className="mt-0.5 text-[11px] text-slate-400">Voice Log Bot</span> : null}
      </span>
    </span>
  );
}
