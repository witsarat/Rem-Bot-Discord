export function RemLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Rem">
      <defs>
        <linearGradient id="remGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#bfeaff" />
          <stop offset="100%" stopColor="#4ea9e0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="#0d1626" stroke="url(#remGrad)" strokeWidth="2.5" />
      <circle
        cx="32"
        cy="32"
        r="24"
        fill="none"
        stroke="#eaf6ff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="0.5 12.07"
        opacity="0.8"
      />
      <text
        x="32"
        y="39"
        textAnchor="middle"
        fontSize="17"
        fontWeight="600"
        fill="url(#remGrad)"
        fontFamily="Mitr, 'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif"
      >
        レム
      </text>
    </svg>
  );
}
