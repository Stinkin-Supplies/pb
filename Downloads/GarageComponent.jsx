import { useState, useEffect, useRef } from "react";

// ── BIKE SVG DRAWINGS ─────────────────────────────────────────
// Each path uses stroke-dasharray/dashoffset animation to "draw" itself in

const ORANGE = "#f97316";
const ODIM = "rgba(249,115,22,0.45)";
const OWEAK = "rgba(249,115,22,0.22)";

function Spoke({ cx, cy, angle, r }) {
  const rad = (angle * Math.PI) / 180;
  return (
    <line
      x1={cx} y1={cy}
      x2={cx + (r - 5) * Math.sin(rad)}
      y2={cy - (r - 5) * Math.cos(rad)}
      stroke={ODIM} strokeWidth={0.8}
    />
  );
}

function Wheel({ cx, cy, r, spokes = 24 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} stroke={ORANGE} strokeWidth={1.8} fill="none" />
      <circle cx={cx} cy={cy} r={r * 0.82} stroke={ODIM} strokeWidth={0.8} fill="none" />
      {Array.from({ length: spokes }, (_, i) => (
        <Spoke key={i} cx={cx} cy={cy} angle={(360 / spokes) * i} r={r} />
      ))}
      <circle cx={cx} cy={cy} r={5.5} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <circle cx={cx} cy={cy} r={2} stroke={ORANGE} strokeWidth={1} fill="none" />
    </g>
  );
}

// ── CRUISER ───────────────────────────────────────────────────
function CruiserSVG() {
  return (
    <g transform="translate(12, -8)">
      <Wheel cx={90} cy={198} r={52} />
      <Wheel cx={388} cy={198} r={52} />
      {/* Raked forks */}
      <line x1={335} y1={95} x2={380} y2={196} stroke={ORANGE} strokeWidth={2} />
      <line x1={347} y1={95} x2={392} y2={196} stroke={ORANGE} strokeWidth={2} />
      <line x1={353} y1={138} x2={368} y2={138} stroke={ODIM} strokeWidth={1} />
      {/* Frame */}
      <line x1={338} y1={90} x2={185} y2={108} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={185} y1={108} x2={152} y2={146} stroke={ORANGE} strokeWidth={2} />
      <line x1={152} y1={146} x2={90} y2={198} stroke={ORANGE} strokeWidth={2} />
      <line x1={338} y1={90} x2={235} y2={178} stroke={ORANGE} strokeWidth={2} />
      <line x1={235} y1={178} x2={90} y2={198} stroke={ORANGE} strokeWidth={1.8} />
      {/* V-Twin cylinders */}
      <line x1={212} y1={136} x2={196} y2={90} stroke={ORANGE} strokeWidth={3.5} />
      <line x1={252} y1={136} x2={262} y2={88} stroke={ORANGE} strokeWidth={3.5} />
      {[0,1,2,3,4].map(i => (
        <line key={i} x1={192} y1={130-i*8} x2={208} y2={130-i*8} stroke={ODIM} strokeWidth={0.9} />
      ))}
      {[0,1,2,3,4].map(i => (
        <line key={i} x1={258} y1={128-i*8} x2={274} y2={128-i*8} stroke={ODIM} strokeWidth={0.9} />
      ))}
      {/* Engine block */}
      <rect x={190} y={136} width={108} height={50} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <circle cx={222} cy={162} r={17} stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Tank */}
      <ellipse cx={248} cy={100} rx={62} ry={19} stroke={ORANGE} strokeWidth={2} fill="none" />
      {/* Seat */}
      <path d="M 152 126 Q 174 116 218 118 Q 234 120 238 128 Q 218 136 168 136 Q 152 133 152 126" stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Rear / front fenders */}
      <path d="M 90 147 Q 100 130 128 128 Q 158 128 163 143" stroke={ODIM} strokeWidth={1.2} fill="none" />
      <path d="M 344 176 Q 358 160 376 153 Q 398 148 413 164" stroke={ODIM} strokeWidth={1.2} fill="none" />
      {/* Pull-back bars */}
      <path d="M 306 72 Q 325 60 345 72 Q 350 75 348 80" stroke={ORANGE} strokeWidth={2} fill="none" />
      <line x1={304} y1={72} x2={312} y2={82} stroke={ORANGE} strokeWidth={1.5} />
      {/* Headlight */}
      <circle cx={404} cy={170} r={14} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <circle cx={404} cy={170} r={8} stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Exhaust */}
      <path d="M 268 182 Q 298 192 310 188 Q 342 178 358 183 Q 378 190 392 198" stroke={ORANGE} strokeWidth={2.5} fill="none" />
      <path d="M 268 178 Q 298 188 310 183 Q 342 173 358 178 Q 378 185 392 193" stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Footpeg */}
      <line x1={190} y1={185} x2={215} y2={185} stroke={ORANGE} strokeWidth={2} />
    </g>
  );
}

// ── CHOPPER ───────────────────────────────────────────────────
function ChopperSVG() {
  return (
    <g transform="translate(5, -5)">
      {/* Rear wheel - bigger, further back */}
      <Wheel cx={105} cy={198} r={56} />
      {/* Front wheel - smaller, WAY out front */}
      <Wheel cx={405} cy={205} r={44} spokes={20} />

      {/* Extreme extended raked forks - the chopper signature */}
      <line x1={322} y1={68} x2={398} y2={205} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={334} y1={68} x2={410} y2={205} stroke={ORANGE} strokeWidth={2.2} />
      {/* Fork legs detail */}
      <line x1={340} y1={100} x2={356} y2={100} stroke={ODIM} strokeWidth={1} />
      <line x1={348} y1={130} x2={364} y2={135} stroke={ODIM} strokeWidth={1} />
      {/* Fork brace lower */}
      <line x1={356} y1={162} x2={374} y2={167} stroke={ODIM} strokeWidth={1} />

      {/* Frame backbone - long low rigid frame */}
      <line x1={326} y1={62} x2={168} y2={90} stroke={ORANGE} strokeWidth={2.5} />
      {/* Top tube */}
      <line x1={168} y1={90} x2={138} y2={130} stroke={ORANGE} strokeWidth={2.2} />
      {/* Seat tube down */}
      <line x1={138} y1={130} x2={148} y2={165} stroke={ORANGE} strokeWidth={2} />
      {/* Rear stays to axle */}
      <line x1={148} y1={165} x2={105} y2={198} stroke={ORANGE} strokeWidth={2} />
      <line x1={168} y1={90} x2={160} y2={165} stroke={ORANGE} strokeWidth={1.8} />
      <line x1={160} y1={165} x2={105} y2={198} stroke={ODIM} strokeWidth={1.5} />
      {/* Down tube - long angled */}
      <line x1={326} y1={62} x2={195} y2={165} stroke={ORANGE} strokeWidth={2} />
      <line x1={195} y1={165} x2={105} y2={198} stroke={ORANGE} strokeWidth={1.8} />

      {/* V-Twin engine - big and proud */}
      {/* Rear cylinder - angled back */}
      <line x1={200} y1={148} x2={188} y2={95} stroke={ORANGE} strokeWidth={4} />
      {[0,1,2,3,4].map(i => (
        <line key={i} x1={183+i} y1={130-i*7} x2={200+i} y2={130-i*7} stroke={ODIM} strokeWidth={1} />
      ))}
      {/* Front cylinder - nearly vertical */}
      <line x1={240} y1={148} x2={245} y2={88} stroke={ORANGE} strokeWidth={4} />
      {[0,1,2,3,4].map(i => (
        <line key={i} x1={240} y1={126-i*7} x2={258} y2={126-i*7} stroke={ODIM} strokeWidth={1} />
      ))}
      {/* Engine cases - wide bottom */}
      <path d="M 178 148 Q 178 168 200 175 Q 230 180 255 175 Q 272 168 272 148 Z"
        stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <path d="M 185 158 Q 205 162 230 162 Q 250 162 262 158"
        stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Primary drive cover */}
      <ellipse cx={210} cy={165} rx={22} ry={16} stroke={ODIM} strokeWidth={1} fill="none" />
      <circle cx={210} cy={165} r={8} stroke={OWEAK} strokeWidth={1} fill="none" />

      {/* Long stretched tank - chopper style, low and narrow */}
      <path d="M 168 85 Q 200 72 265 75 Q 310 77 326 68 Q 330 72 330 78 Q 318 88 275 90 Q 220 92 175 95 Q 165 94 168 85"
        stroke={ORANGE} strokeWidth={2} fill="none" />
      {/* Tank seam line */}
      <path d="M 175 80 Q 230 74 310 76" stroke={ODIM} strokeWidth={0.8} fill="none" />

      {/* Bobber/chopper seat - solo seat, low */}
      <path d="M 140 118 Q 158 108 195 108 Q 210 108 215 116 Q 200 124 162 126 Q 143 126 140 118"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Sissy bar */}
      <line x1={140} y1={118} x2={132} y2={88} stroke={ORANGE} strokeWidth={1.5} />
      <line x1={146} y1={118} x2={138} y2={88} stroke={ODIM} strokeWidth={1} />
      <path d="M 132 88 Q 135 82 138 88" stroke={ORANGE} strokeWidth={1.5} fill="none" />

      {/* Ape hanger bars - the chopper signature handlebars */}
      <line x1={290} y1={58} x2={290} y2={32} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={290} y1={32} x2={260} y2={32} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={290} y1={32} x2={320} y2={32} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={260} y1={32} x2={257} y2={40} stroke={ORANGE} strokeWidth={2} />
      <line x1={320} y1={32} x2={323} y2={40} stroke={ORANGE} strokeWidth={2} />
      {/* Brake/clutch levers */}
      <line x1={258} y1={36} x2={248} y2={43} stroke={ODIM} strokeWidth={1.5} />
      <line x1={322} y1={36} x2={332} y2={43} stroke={ODIM} strokeWidth={1.5} />

      {/* Springer front end detail on forks */}
      <rect x={330} y={108} width={18} height={28} rx={2} stroke={ODIM} strokeWidth={1} fill="none" />
      <line x1={334} y1={108} x2={334} y2={136} stroke={OWEAK} strokeWidth={0.7} />
      <line x1={344} y1={108} x2={344} y2={136} stroke={OWEAK} strokeWidth={0.7} />

      {/* Teardrop headlight on long nacelle */}
      <ellipse cx={415} cy={178} rx={16} ry={12} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <ellipse cx={415} cy={178} rx={9} ry={7} stroke={ODIM} strokeWidth={1} fill="none" />
      <line x1={399} y1={178} x2={385} y2={178} stroke={ODIM} strokeWidth={0.8} />

      {/* Fishtail exhaust - long and dramatic */}
      <path d="M 255 173 Q 280 180 300 177 Q 340 170 370 175 Q 392 180 405 192 Q 415 202 418 210"
        stroke={ORANGE} strokeWidth={2.8} fill="none" />
      <path d="M 255 170 Q 280 177 300 173 Q 340 166 370 171 Q 392 176 405 187"
        stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Fishtail end */}
      <path d="M 405 187 Q 416 195 422 206 Q 416 210 405 205 Q 410 198 405 192"
        stroke={ORANGE} strokeWidth={1.5} fill="none" />

      {/* Low front fender - just a hint */}
      <path d="M 380 175 Q 368 162 362 152" stroke={ODIM} strokeWidth={1.3} fill="none" />

      {/* Rear fender - skirted */}
      <path d="M 105 143 Q 118 128 148 126 Q 168 126 168 140 Q 155 150 128 152 Q 108 150 105 143"
        stroke={ODIM} strokeWidth={1.2} fill="none" />

      {/* Forward controls */}
      <line x1={218} y1={178} x2={248} y2={198} stroke={ODIM} strokeWidth={1.5} />
      <line x1={245} y1={195} x2={262} y2={195} stroke={ORANGE} strokeWidth={2} />

      {/* Belt/chain guard */}
      <path d="M 155 190 Q 175 185 200 187 Q 155 202 138 202 Q 120 202 155 190"
        stroke={OWEAK} strokeWidth={1} fill="none" />
    </g>
  );
}

// ── SPORT ─────────────────────────────────────────────────────
function SportbikeSVG() {
  return (
    <g transform="translate(8, -5)">
      <Wheel cx={82} cy={200} r={50} />
      <Wheel cx={398} cy={200} r={50} />
      {/* Steep forks */}
      <line x1={360} y1={105} x2={396} y2={200} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={370} y1={105} x2={406} y2={200} stroke={ORANGE} strokeWidth={2.2} />
      {/* Frame */}
      <line x1={362} y1={100} x2={238} y2={120} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={238} y1={120} x2={208} y2={178} stroke={ORANGE} strokeWidth={2} />
      <line x1={208} y1={178} x2={82} y2={200} stroke={ORANGE} strokeWidth={1.8} />
      <line x1={362} y1={100} x2={288} y2={170} stroke={ORANGE} strokeWidth={2} />
      <line x1={288} y1={170} x2={208} y2={178} stroke={ODIM} strokeWidth={1.5} />
      {/* Subframe */}
      <line x1={238} y1={120} x2={172} y2={100} stroke={ORANGE} strokeWidth={2} />
      <line x1={172} y1={100} x2={155} y2={140} stroke={ORANGE} strokeWidth={1.8} />
      <line x1={155} y1={140} x2={208} y2={178} stroke={ODIM} strokeWidth={1.5} />
      {/* Inline-4 engine */}
      <rect x={212} y={130} width={92} height={50} rx={2} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <rect x={212} y={98} width={92} height={34} rx={2} stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {[0,1,2,3].map(i => (
        <rect key={i} x={218+i*21} y={88} width={13} height={12} rx={1}
          stroke={ORANGE} strokeWidth={1.2} fill="none" />
      ))}
      {/* Tank */}
      <path d="M 238 108 Q 270 86 318 90 Q 348 94 362 105 Q 350 112 300 116 Q 262 116 238 108"
        stroke={ORANGE} strokeWidth={2} fill="none" />
      {/* Upper fairing */}
      <path d="M 362 100 Q 392 88 420 110 Q 430 130 424 162 Q 418 182 408 190 Q 398 160 384 140 Q 370 118 362 100"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Ram air */}
      <ellipse cx={404} cy={118} rx={9} ry={6} stroke={ODIM} strokeWidth={1.2} fill="none" />
      {/* Tail fairing */}
      <path d="M 172 100 Q 142 85 118 90 Q 104 96 108 115 Q 114 135 152 140"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Windscreen */}
      <path d="M 362 100 Q 375 84 394 86 Q 408 90 418 108"
        stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Clip-on bars */}
      <line x1={342} y1={88} x2={375} y2={88} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={362} y1={83} x2={362} y2={93} stroke={ORANGE} strokeWidth={2} />
      {/* Underbelly exhausts */}
      {[0,1,2,3].map(i => (
        <line key={i} x1={310+i*4} y1={178} x2={355} y2={192} stroke={ODIM} strokeWidth={1} />
      ))}
      <path d="M 355 188 Q 378 190 398 195 Q 408 198 412 205"
        stroke={ORANGE} strokeWidth={2.5} fill="none" />
      {/* Front fender */}
      <path d="M 364 176 Q 375 160 388 153 Q 402 148 414 162"
        stroke={ODIM} strokeWidth={1.2} fill="none" />
    </g>
  );
}

// ── ADVENTURE ─────────────────────────────────────────────────
function AdventureSVG() {
  return (
    <g transform="translate(10, -10)">
      <Wheel cx={88} cy={200} r={54} spokes={18} />
      <Wheel cx={395} cy={200} r={52} spokes={18} />
      {/* Long travel forks */}
      <line x1={354} y1={82} x2={393} y2={200} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={365} y1={82} x2={404} y2={200} stroke={ORANGE} strokeWidth={2.2} />
      <rect x={355} y={100} width={18} height={32} rx={3} stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Backbone frame */}
      <line x1={356} y1={78} x2={205} y2={95} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={205} y1={95} x2={168} y2={135} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={168} y1={135} x2={88} y2={200} stroke={ORANGE} strokeWidth={2} />
      <line x1={356} y1={78} x2={248} y2={172} stroke={ORANGE} strokeWidth={2} />
      <line x1={248} y1={172} x2={88} y2={200} stroke={ORANGE} strokeWidth={1.8} />
      {/* Subframe */}
      <line x1={205} y1={95} x2={168} y2={72} stroke={ORANGE} strokeWidth={2} />
      <line x1={168} y1={72} x2={148} y2={138} stroke={ORANGE} strokeWidth={1.8} />
      <line x1={148} y1={138} x2={168} y2={135} stroke={ODIM} strokeWidth={1.2} />
      {/* Engine - parallel twin */}
      <rect x={220} y={125} width={82} height={52} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <line x1={232} y1={125} x2={228} y2={88} stroke={ORANGE} strokeWidth={3} />
      <line x1={268} y1={125} x2={264} y2={88} stroke={ORANGE} strokeWidth={3} />
      {[0,1,2,3].map(i => (
        <line key={i} x1={224} y1={118-i*8} x2={238} y2={118-i*8} stroke={ODIM} strokeWidth={0.9} />
      ))}
      {[0,1,2,3].map(i => (
        <line key={i} x1={260} y1={118-i*8} x2={274} y2={118-i*8} stroke={ODIM} strokeWidth={0.9} />
      ))}
      {/* Tank - tall */}
      <path d="M 205 88 Q 245 72 310 76 Q 345 80 356 88 Q 345 102 295 106 Q 248 106 205 96 Z"
        stroke={ORANGE} strokeWidth={2} fill="none" />
      {/* High windscreen */}
      <path d="M 356 78 Q 374 58 398 62 Q 415 68 420 88 Q 415 110 408 128"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      <path d="M 365 72 Q 380 56 400 62" stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Tall seat/tank seating position */}
      <path d="M 168 118 Q 196 104 220 104 Q 238 104 240 112 Q 220 125 182 128 Q 166 127 168 118"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Handguards */}
      <line x1={335} y1={72} x2={368} y2={72} stroke={ORANGE} strokeWidth={2.5} />
      <path d="M 335 70 Q 322 65 318 72 Q 322 79 335 74" stroke={ODIM} strokeWidth={1.2} fill="none" />
      <path d="M 368 70 Q 382 65 386 72 Q 382 79 368 74" stroke={ODIM} strokeWidth={1.2} fill="none" />
      {/* Side cases */}
      <rect x={112} y={148} width={48} height={38} rx={3} stroke={ODIM} strokeWidth={1.2} fill="none" />
      <line x1={118} y1={158} x2={154} y2={158} stroke={OWEAK} strokeWidth={0.8} />
      {/* High exhaust */}
      <path d="M 302 177 Q 325 172 345 168 Q 370 164 385 160 Q 400 158 410 162"
        stroke={ORANGE} strokeWidth={2.5} fill="none" />
      <line x1={405} y1={158} x2={418} y2={162} stroke={ORANGE} strokeWidth={3} />
    </g>
  );
}

// ── DIRT BIKE ─────────────────────────────────────────────────
function DirtbikeSVG() {
  return (
    <g transform="translate(15, -15)">
      <Wheel cx={85} cy={205} r={52} spokes={20} />
      <Wheel cx={380} cy={205} r={50} spokes={20} />
      {/* Long travel forks - nearly vertical */}
      <line x1={350} y1={80} x2={378} y2={205} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={361} y1={80} x2={389} y2={205} stroke={ORANGE} strokeWidth={2.2} />
      <rect x={350} y={88} width={18} height={42} rx={3} stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Perimeter frame */}
      <line x1={352} y1={76} x2={220} y2={88} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={220} y1={88} x2={178} y2={118} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={178} y1={118} x2={145} y2={155} stroke={ORANGE} strokeWidth={2} />
      <line x1={145} y1={155} x2={85} y2={205} stroke={ORANGE} strokeWidth={2} />
      <line x1={352} y1={76} x2={268} y2={162} stroke={ORANGE} strokeWidth={2.2} />
      <line x1={268} y1={162} x2={145} y2={162} stroke={ORANGE} strokeWidth={2} />
      <line x1={145} y1={162} x2={85} y2={205} stroke={ODIM} strokeWidth={1.5} />
      <line x1={220} y1={88} x2={178} y2={62} stroke={ORANGE} strokeWidth={2} />
      <line x1={178} y1={62} x2={155} y2={120} stroke={ORANGE} strokeWidth={1.8} />
      {/* Single cylinder engine */}
      <line x1={222} y1={125} x2={215} y2={72} stroke={ORANGE} strokeWidth={4.5} />
      {[0,1,2,3,4,5].map(i => (
        <line key={i} x1={210} y1={118-i*7} x2={228} y2={118-i*7} stroke={ODIM} strokeWidth={0.9} />
      ))}
      <rect x={198} y={125} width={82} height={42} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      {/* Airbox */}
      <rect x={162} y={88} width={52} height={35} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      {/* Tank */}
      <path d="M 178 80 Q 220 64 290 68 Q 330 72 352 80 Q 335 95 285 98 Q 232 98 178 88 Z"
        stroke={ORANGE} strokeWidth={2} fill="none" />
      {/* Seat */}
      <path d="M 155 110 Q 182 98 222 98 Q 245 98 248 108 Q 225 120 180 122 Q 158 122 155 110"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Handlebars - motocross wide */}
      <line x1={310} y1={68} x2={368} y2={68} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={339} y1={62} x2={339} y2={75} stroke={ORANGE} strokeWidth={2} />
      <line x1={310} y1={68} x2={305} y2={76} stroke={ORANGE} strokeWidth={1.8} />
      <line x1={368} y1={68} x2={373} y2={76} stroke={ORANGE} strokeWidth={1.8} />
      {/* Front number plate */}
      <path d="M 370 95 Q 392 88 408 100 Q 410 115 398 125 Q 382 125 370 110 Z"
        stroke={ORANGE} strokeWidth={1.5} fill="none" />
      {/* High exhaust pipe */}
      <path d="M 278 167 Q 305 158 330 148 Q 358 138 375 130 Q 390 124 405 128"
        stroke={ORANGE} strokeWidth={2.8} fill="none" />
      <line x1={400} y1={124} x2={415} y2={128} stroke={ORANGE} strokeWidth={3.5} />
      {/* Skid plate */}
      <path d="M 198 168 Q 230 175 268 175 Q 268 168 198 168"
        stroke={ODIM} strokeWidth={1.2} fill="none" />
      {/* Front fender - tall */}
      <path d="M 352 162 Q 362 145 370 130 Q 376 115 374 100"
        stroke={ODIM} strokeWidth={1.5} fill="none" />
      {/* Rear fender - high */}
      <path d="M 85 152 Q 98 132 128 125 Q 158 122 160 140 Q 148 155 118 158"
        stroke={ODIM} strokeWidth={1.2} fill="none" />
    </g>
  );
}

// ── SCOOTER ────────────────────────────────────────────────────
function ScooterSVG() {
  return (
    <g transform="translate(30, 0)">
      <Wheel cx={88} cy={200} r={40} spokes={16} />
      <Wheel cx={370} cy={200} r={40} spokes={16} />
      {/* Step-through monocoque body */}
      <path d="M 345 140 Q 358 120 370 110 Q 385 102 395 112 Q 405 125 400 152 Q 395 175 370 190 Q 350 195 330 192"
        stroke={ORANGE} strokeWidth={2} fill="none" />
      <path d="M 330 192 Q 285 198 240 198 Q 200 198 172 195 Q 152 190 140 178 Q 130 165 132 148 Q 135 132 148 122"
        stroke={ORANGE} strokeWidth={2} fill="none" />
      <path d="M 148 122 Q 162 108 185 98 Q 210 88 242 84 Q 270 80 300 82 Q 328 86 345 100 Q 348 108 346 120 Q 344 132 330 138 Q 295 145 260 145 Q 225 148 200 155 Q 175 162 162 175 Q 152 185 155 195"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Step-through cutout */}
      <path d="M 220 145 Q 205 162 198 178 Q 195 192 200 198"
        stroke={ODIM} strokeWidth={1} fill="none" />
      <path d="M 260 145 Q 242 162 236 178" stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Windscreen */}
      <path d="M 300 78 Q 318 60 338 58 Q 355 58 362 72 Q 365 82 358 94"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      <path d="M 308 76 Q 322 62 340 62" stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Headlight integrated */}
      <ellipse cx={390} cy={128} rx={12} ry={10} stroke={ORANGE} strokeWidth={1.5} fill="none" />
      <ellipse cx={390} cy={128} rx={7} ry={6} stroke={ODIM} strokeWidth={1} fill="none" />
      {/* Handlebars */}
      <line x1={325} y1={80} x2={365} y2={80} stroke={ORANGE} strokeWidth={2.5} />
      <line x1={345} y1={72} x2={345} y2={88} stroke={ORANGE} strokeWidth={2} />
      <line x1={325} y1={80} x2={320} y2={88} stroke={ODIM} strokeWidth={1.5} />
      <line x1={365} y1={80} x2={370} y2={88} stroke={ODIM} strokeWidth={1.5} />
      {/* Seat */}
      <path d="M 175 130 Q 215 118 275 118 Q 310 118 330 126 Q 315 140 265 142 Q 215 142 178 138 Q 168 135 175 130"
        stroke={ORANGE} strokeWidth={1.8} fill="none" />
      {/* Exhaust - small under engine */}
      <path d="M 142 185 Q 115 185 100 190 Q 92 195 95 200"
        stroke={ORANGE} strokeWidth={2} fill="none" />
      {/* Front leg shield */}
      <path d="M 345 100 Q 342 118 335 130 Q 325 142 310 145"
        stroke={ODIM} strokeWidth={1.2} fill="none" />
      {/* Footboard */}
      <line x1={148} y1={198} x2={220} y2={198} stroke={ORANGE} strokeWidth={2.5} />
    </g>
  );
}

// ─── BIKE REGISTRY ─────────────────────────────────────────────

const BIKES = {
  cruiser: {
    label: "Cruiser",
    icon: "〰",
    Component: CruiserSVG,
    desc: "V-Twin · Low & Wide",
    makes: ["Harley-Davidson","Indian","Honda","Yamaha","Kawasaki","Suzuki"],
    models: {
      "Harley-Davidson": ["Road King","Street Glide","Fat Boy","Sportster","Road Glide","Heritage Softail"],
      "Indian": ["Chief","Scout","Challenger","Springfield"],
      "Honda": ["Gold Wing","Shadow","Rebel"],
      "Yamaha": ["V-Star 1300","Bolt","Raider"],
      "Kawasaki": ["Vulcan 1700","Vulcan S","Eliminator"],
      "Suzuki": ["Boulevard M109R","Boulevard C50","Intruder"],
    }
  },
  chopper: {
    label: "Chopper",
    icon: "⛓",
    Component: ChopperSVG,
    desc: "Extended Forks · Ape Hangers",
    makes: ["Harley-Davidson","Indian","Custom","West Coast Choppers","Orange County Choppers"],
    models: {
      "Harley-Davidson": ["Softail Slim","Fat Bob","Low Rider","Street Bob","Pan America"],
      "Indian": ["Chief Dark Horse","Super Chief"],
      "Custom": ["Rigid Frame","Softail Custom","Hardtail"],
      "West Coast Choppers": ["El Diablo","Celtec","Jesse James Custom"],
      "Orange County Choppers": ["Fire Bike","Jet Bike","Custom Build"],
    }
  },
  sport: {
    label: "Sportbike",
    icon: "⚡",
    Component: SportbikeSVG,
    desc: "Inline-4 · Full Fairing",
    makes: ["Honda","Yamaha","Kawasaki","Suzuki","BMW","Ducati"],
    models: {
      "Honda": ["CBR1000RR","CBR600RR","CBR500R"],
      "Yamaha": ["YZF-R1","YZF-R6","YZF-R3"],
      "Kawasaki": ["Ninja ZX-10R","Ninja ZX-6R","Ninja 400"],
      "Suzuki": ["GSX-R1000","GSX-R750","GSX-R600"],
      "BMW": ["S 1000 RR","M 1000 RR"],
      "Ducati": ["Panigale V4","Panigale V2","Streetfighter"],
    }
  },
  adventure: {
    label: "Adventure",
    icon: "🌐",
    Component: AdventureSVG,
    desc: "Parallel Twin · Long Travel",
    makes: ["BMW","KTM","Honda","Yamaha","Kawasaki","Triumph"],
    models: {
      "BMW": ["R 1250 GS","F 850 GS","F 750 GS"],
      "KTM": ["1290 Super Adventure","890 Adventure","390 Adventure"],
      "Honda": ["Africa Twin","CB500X"],
      "Yamaha": ["Ténéré 700","Super Ténéré"],
      "Kawasaki": ["Versys 1000","Versys 650"],
      "Triumph": ["Tiger 1200","Tiger 900","Tiger Sport"],
    }
  },
  dirt: {
    label: "Dirt Bike",
    icon: "🏔",
    Component: DirtbikeSVG,
    desc: "Single Cyl · Motocross",
    makes: ["Honda","Yamaha","KTM","Kawasaki","Husqvarna","Suzuki"],
    models: {
      "Honda": ["CRF450R","CRF250R","CRF125F","CRF50F"],
      "Yamaha": ["YZ450F","YZ250F","WR450F"],
      "KTM": ["450 SX-F","250 SX-F","350 EXC-F"],
      "Kawasaki": ["KX450","KX250","KLX300R"],
      "Husqvarna": ["FC 450","FC 350","FE 350"],
      "Suzuki": ["RM-Z450","RM-Z250","DR-Z400"],
    }
  },
  scooter: {
    label: "Scooter",
    icon: "◎",
    Component: ScooterSVG,
    desc: "Automatic · Step-Through",
    makes: ["Honda","Yamaha","Vespa","Kymco","Piaggio","Suzuki"],
    models: {
      "Honda": ["PCX","Forza","ADV350","Ruckus"],
      "Yamaha": ["XMAX","NMAX","Zuma"],
      "Vespa": ["GTS 300","Primavera","Sprint"],
      "Kymco": ["Like 200","Downtown 350"],
      "Piaggio": ["MP3","Liberty","Typhoon"],
      "Suzuki": ["Burgman 650","Burgman 400"],
    }
  },
};

const YEARS = Array.from({ length: 30 }, (_, i) => 2025 - i);

// ─── POINT-OF-VIEW CARD ────────────────────────────────────────

function BikeCard({ bike, onSelect, selected, onRemove }) {
  const BikeComp = BIKES[bike.type]?.Component;
  return (
    <div
      className={`garage-card ${selected ? "primary-card" : ""} shimmer-enter`}
      onClick={() => onSelect(bike.id)}
      style={{ position: "relative" }}
    >
      {selected && <div className="primary-badge">PRIMARY</div>}
      <div className="card-thumb">
        <svg viewBox="0 0 480 240" width="100%" style={{ maxHeight: 100 }}>
          <defs>
            <filter id={`glow-mini-${bike.id}`}>
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <g filter={`url(#glow-mini-${bike.id})`}>
            {BikeComp && <BikeComp />}
          </g>
        </svg>
      </div>
      <div className="card-body">
        <div className="card-year">{bike.year}</div>
        <div className="card-name">{bike.make} {bike.model}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <div className="card-type">{BIKES[bike.type]?.label}</div>
          <button className="remove-btn" onClick={e => { e.stopPropagation(); onRemove(bike.id); }}>
            REMOVE
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ANIMATED BIKE PREVIEW ────────────────────────────────────

function BikePreview({ type, animKey }) {
  const config = BIKES[type];
  if (!config) return null;
  const { Component } = config;

  return (
    <div className="bike-canvas-wrap" style={{ padding: 0 }}>
      <div className="corner-mark tl" /><div className="corner-mark tr" />
      <div className="corner-mark bl" /><div className="corner-mark br" />
      <div className="scan-line" />

      {/* Grid overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(249,115,22,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.03) 1px, transparent 1px)",
        backgroundSize: "28px 28px"
      }} />

      {/* Glowing backdrop for bike */}
      <div style={{
        position: "absolute", bottom: "20%", left: "10%", right: "10%", height: "30%",
        background: "radial-gradient(ellipse, rgba(249,115,22,0.08) 0%, transparent 70%)",
        pointerEvents: "none"
      }} />

      <svg
        key={animKey}
        viewBox="0 0 480 250"
        width="100%"
        className="bike-svg animating"
        style={{ display: "block", padding: "24px 16px" }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#glow)">
          <Component />
        </g>
        {/* Ground shadow line */}
        <line x1={40} y1={248} x2={440} y2={248}
          stroke="rgba(249,115,22,0.15)" strokeWidth={1}
          strokeDasharray="4 4"
        />
      </svg>

      {/* Spec labels */}
      <div style={{ padding: "0 20px 16px", display: "flex", justifyContent: "space-between" }}>
        <span className="section-label">{config.desc}</span>
        <span className="section-label" style={{ color: "#4b5563" }}>
          {animKey > 0 ? "RENDERED" : "BLUEPRINT"}
        </span>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────

export default function GarageComponent() {
  const [garage, setGarage] = useState([
    { id: 1, type: "cruiser", year: 2021, make: "Harley-Davidson", model: "Road King", primary: true },
  ]);
  const [selectedType, setSelectedType] = useState("cruiser");
  const [form, setForm] = useState({ year: 2022, make: "", model: "", nickname: "" });
  const [previewKey, setPreviewKey] = useState(0);
  const [primaryId, setPrimaryId] = useState(1);
  const [justAdded, setJustAdded] = useState(null);

  const makes = BIKES[selectedType]?.makes || [];
  const models = form.make ? (BIKES[selectedType]?.models[form.make] || []) : [];

  function handleTypeSelect(type) {
    setSelectedType(type);
    setForm(f => ({ ...f, make: "", model: "" }));
    setPreviewKey(k => k + 1);
  }

  function handleMakeChange(make) {
    setForm(f => ({ ...f, make, model: "" }));
  }

  function handleAdd() {
    if (!form.make || !form.model) return;
    const newId = Date.now();
    const newBike = {
      id: newId,
      type: selectedType,
      year: form.year,
      make: form.make,
      model: form.model,
      nickname: form.nickname,
      primary: garage.length === 0,
    };
    setGarage(g => [...g, newBike]);
    if (garage.length === 0) setPrimaryId(newId);
    setJustAdded(newId);
    setPreviewKey(k => k + 1);
    setForm({ year: 2022, make: "", model: "", nickname: "" });
    setTimeout(() => setJustAdded(null), 2000);
  }

  function handleRemove(id) {
    setGarage(g => {
      const next = g.filter(b => b.id !== id);
      if (primaryId === id && next.length > 0) setPrimaryId(next[0].id);
      return next;
    });
  }

  const canAdd = !!form.make && !!form.model;

  return (
    <>
      <style>{style}</style>
      <div className="garage-root blueprint-bg">

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", gap: 16 }}>
          <div>
            <div className="section-label" style={{ marginBottom: 6 }}>Powersports Platform</div>
            <h1 style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 32, fontWeight: 700, color: "#f1f5f9",
              lineHeight: 1, letterSpacing: "0.02em"
            }}>
              MY GARAGE
            </h1>
          </div>
          <div style={{
            marginBottom: 4,
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 12, color: "#f97316", opacity: 0.6
          }}>
            {garage.length} VEHICLE{garage.length !== 1 ? "S" : ""} REGISTERED
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, maxWidth: 1100 }}>

          {/* LEFT — Preview + Garage Grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Live Preview */}
            <BikePreview type={selectedType} animKey={previewKey} />

            {/* Garage */}
            {garage.length > 0 && (
              <div>
                <div className="section-label" style={{ marginBottom: 12 }}>Saved Vehicles</div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: 12
                }}>
                  {garage.map(bike => (
                    <BikeCard
                      key={bike.id}
                      bike={bike}
                      selected={bike.id === primaryId}
                      onSelect={setPrimaryId}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Add Vehicle Panel */}
          <div>
            <div style={{
              background: "#0d0f10",
              border: "1px solid rgba(249,115,22,0.12)",
              borderRadius: 12,
              padding: 24,
              position: "sticky",
              top: 24,
            }}>
              <div className="section-label" style={{ marginBottom: 16 }}>Add Vehicle</div>

              {/* Type selector */}
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 10, letterSpacing: "0.15em",
                  color: "#4b5563", display: "block", marginBottom: 8
                }}>VEHICLE TYPE</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(BIKES).map(([key, config]) => (
                    <button
                      key={key}
                      className={`type-btn ${selectedType === key ? "active" : ""}`}
                      onClick={() => handleTypeSelect(key)}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year */}
              <div className="field-wrap" style={{ marginBottom: 14 }}>
                <label>Year</label>
                <select value={form.year} onChange={e => setForm(f => ({ ...f, year: +e.target.value }))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* Make */}
              <div className="field-wrap" style={{ marginBottom: 14 }}>
                <label>Make</label>
                <select value={form.make} onChange={e => handleMakeChange(e.target.value)}>
                  <option value="">Select make...</option>
                  {makes.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Model */}
              <div className="field-wrap" style={{ marginBottom: 14 }}>
                <label>Model</label>
                <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} disabled={!form.make}>
                  <option value="">Select model...</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Nickname */}
              <div className="field-wrap" style={{ marginBottom: 22 }}>
                <label>Nickname <span style={{ color: "#374151", fontWeight: 400 }}>(optional)</span></label>
                <input
                  value={form.nickname}
                  onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                  placeholder='e.g. "The Daily", "Track Bike"'
                />
              </div>

              {/* Points callout */}
              <div style={{
                background: "rgba(249,115,22,0.06)",
                border: "1px solid rgba(249,115,22,0.18)",
                borderRadius: 8, padding: "12px 14px",
                marginBottom: 16,
                display: "flex", alignItems: "center", gap: 12
              }}>
                <div style={{ fontSize: 22 }}>+</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316" }}>100 POINTS</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Earned for adding your first vehicle</div>
                </div>
              </div>

              <button className="add-btn" onClick={handleAdd} disabled={!canAdd}>
                ADD TO GARAGE
              </button>

              {justAdded && (
                <div style={{
                  marginTop: 12, textAlign: "center",
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 11, color: "#f97316",
                  animation: "fadeInGlow 0.3s ease forwards"
                }}>
                  ✓ VEHICLE REGISTERED — 100 PTS AWARDED
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
