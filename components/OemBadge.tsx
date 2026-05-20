// OemBadge.tsx
// Ribbon-style OEM badge for product cards
// Drop into top-left corner with position: absolute, top: 8, left: 0

export function OemBadge() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 72 22"
      width={72}
      height={22}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="oem-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#ffd700" />
          <stop offset="50%"  stopColor="#c8a800" />
          <stop offset="100%" stopColor="#a88800" />
        </linearGradient>
      </defs>

      {/* Shadow layer */}
      <path
        d="M6,3 L66,3 L72,11 L66,19 L6,19 L0,11 Z"
        fill="rgba(0,0,0,0.18)"
        transform="translate(1,1.5)"
      />

      {/* Main ribbon body */}
      <path
        d="M6,2 L66,2 L72,11 L66,20 L6,20 L0,11 Z"
        fill="url(#oem-grad)"
      />

      {/* Inner highlight line */}
      <path
        d="M8,5 L64,5 L69,11 L64,17 L8,17 L3,11 Z"
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="0.75"
      />

      {/* OEM text */}
      <text
        x="36"
        y="15"
        textAnchor="middle"
        fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
        fontWeight="700"
        fontSize="9"
        letterSpacing="1.5"
        fill="rgba(0,0,0,0.75)"
      >
        OEM
      </text>
    </svg>
  );
}
