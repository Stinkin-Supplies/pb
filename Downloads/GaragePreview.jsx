import { useState } from "react";

const style = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .garage-root { font-family: 'Rajdhani', sans-serif; background: #07080a; min-height: 100vh; color: #e5e7eb; padding: 24px 20px; }
  .blueprint-bg { background-image: linear-gradient(rgba(249,115,22,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.04) 1px, transparent 1px); background-size: 36px 36px; }
  .section-label { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 0.2em; color: #f97316; text-transform: uppercase; opacity: 0.8; }
  .bike-canvas-wrap { position: relative; border-radius: 12px; overflow: hidden; background: #0d0f10; border: 1px solid rgba(249,115,22,0.15); box-shadow: 0 0 60px rgba(249,115,22,0.04), inset 0 0 60px rgba(0,0,0,0.5); }
  .corner-mark { position: absolute; width: 16px; height: 16px; opacity: 0.5; }
  .corner-mark.tl { top: 8px; left: 8px; border-top: 1px solid #f97316; border-left: 1px solid #f97316; }
  .corner-mark.tr { top: 8px; right: 8px; border-top: 1px solid #f97316; border-right: 1px solid #f97316; }
  .corner-mark.bl { bottom: 8px; left: 8px; border-bottom: 1px solid #f97316; border-left: 1px solid #f97316; }
  .corner-mark.br { bottom: 8px; right: 8px; border-bottom: 1px solid #f97316; border-right: 1px solid #f97316; }
  .scan-line { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(249,115,22,0.3), transparent); animation: scanAnim 4s ease-in-out infinite; pointer-events: none; }
  @keyframes scanAnim { 0% { top: 10%; opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { top: 90%; opacity: 0; } }
  .type-btn { background: transparent; border: 1px solid rgba(249,115,22,0.2); color: #9ca3af; font-family: 'Rajdhani', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 11px; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
  .type-btn:hover { border-color: #f97316; color: #f97316; background: rgba(249,115,22,0.05); }
  .type-btn.active { border-color: #f97316; color: #f97316; background: rgba(249,115,22,0.12); }
  .garage-card { background: #0d0f10; border: 1px solid rgba(249,115,22,0.12); border-radius: 10px; overflow: hidden; transition: all 0.25s; cursor: pointer; position: relative; }
  .garage-card:hover { border-color: rgba(249,115,22,0.35); transform: translateY(-2px); }
  .garage-card.primary-card { border-color: rgba(249,115,22,0.4); }
  .card-thumb { background: #0a0b0c; padding: 8px; display: flex; align-items: center; justify-content: center; }
  .card-body { padding: 10px 12px; }
  .card-year { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: #f97316; }
  .card-name { font-size: 13px; font-weight: 700; color: #f1f5f9; line-height: 1.2; margin-top: 2px; }
  .card-type { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }
  .primary-badge { position: absolute; top: 6px; right: 6px; background: rgba(249,115,22,0.15); border: 1px solid rgba(249,115,22,0.4); border-radius: 3px; padding: 1px 5px; font-family: 'Share Tech Mono', monospace; font-size: 8px; color: #f97316; letter-spacing: 0.1em; }
  .field-wrap label { font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; display: block; margin-bottom: 5px; }
  .field-wrap select, .field-wrap input { width: 100%; background: #131416; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #e5e7eb; font-family: 'Rajdhani', sans-serif; font-size: 14px; padding: 8px 10px; outline: none; transition: border-color 0.2s; appearance: none; -webkit-appearance: none; }
  .field-wrap select:focus, .field-wrap input:focus { border-color: #f97316; }
  .field-wrap input::placeholder { color: #374151; }
  .add-btn { width: 100%; padding: 12px; background: linear-gradient(135deg, #f97316, #ea6a0a); border: none; border-radius: 8px; color: #0a0b0c; font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 24px rgba(249,115,22,0.3); }
  .add-btn:hover { filter: brightness(1.08); box-shadow: 0 6px 30px rgba(249,115,22,0.45); }
  .add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .remove-btn { background: transparent; border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; color: #4b5563; font-size: 10px; padding: 3px 7px; cursor: pointer; transition: all 0.2s; font-family: 'Share Tech Mono', monospace; }
  .remove-btn:hover { border-color: #dc2626; color: #dc2626; }
  @keyframes enterCard { from { opacity: 0; transform: scale(0.88) translateY(12px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  .shimmer-enter { animation: enterCard 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  @keyframes fadeGlow { from { opacity:0; } to { opacity:1; } }
`;

const ORANGE = "#f97316";
const ODIM = "rgba(249,115,22,0.45)";
const OWEAK = "rgba(249,115,22,0.22)";

function Spoke({ cx, cy, angle, r }) {
  const rad = (angle * Math.PI) / 180;
  return <line x1={cx} y1={cy} x2={cx + (r-5)*Math.sin(rad)} y2={cy - (r-5)*Math.cos(rad)} stroke={ODIM} strokeWidth={0.8}/>;
}
function Wheel({ cx, cy, r, spokes=24 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <circle cx={cx} cy={cy} r={r*0.82} stroke={ODIM} strokeWidth={0.8} fill="none"/>
      {Array.from({length:spokes},(_,i)=><Spoke key={i} cx={cx} cy={cy} angle={(360/spokes)*i} r={r}/>)}
      <circle cx={cx} cy={cy} r={5.5} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <circle cx={cx} cy={cy} r={2} stroke={ORANGE} strokeWidth={1} fill="none"/>
    </g>
  );
}

function CruiserSVG() {
  return (
    <g transform="translate(12,-8)">
      <Wheel cx={90} cy={198} r={52}/>
      <Wheel cx={388} cy={198} r={52}/>
      <line x1={335} y1={95} x2={380} y2={196} stroke={ORANGE} strokeWidth={2}/>
      <line x1={347} y1={95} x2={392} y2={196} stroke={ORANGE} strokeWidth={2}/>
      <line x1={353} y1={138} x2={368} y2={138} stroke={ODIM} strokeWidth={1}/>
      <line x1={338} y1={90} x2={185} y2={108} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={185} y1={108} x2={152} y2={146} stroke={ORANGE} strokeWidth={2}/>
      <line x1={152} y1={146} x2={90} y2={198} stroke={ORANGE} strokeWidth={2}/>
      <line x1={338} y1={90} x2={235} y2={178} stroke={ORANGE} strokeWidth={2}/>
      <line x1={235} y1={178} x2={90} y2={198} stroke={ORANGE} strokeWidth={1.8}/>
      <line x1={212} y1={136} x2={196} y2={90} stroke={ORANGE} strokeWidth={3.5}/>
      <line x1={252} y1={136} x2={262} y2={88} stroke={ORANGE} strokeWidth={3.5}/>
      {[0,1,2,3,4].map(i=><line key={i} x1={192} y1={130-i*8} x2={208} y2={130-i*8} stroke={ODIM} strokeWidth={0.9}/>)}
      {[0,1,2,3,4].map(i=><line key={i} x1={258} y1={128-i*8} x2={274} y2={128-i*8} stroke={ODIM} strokeWidth={0.9}/>)}
      <rect x={190} y={136} width={108} height={50} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <circle cx={222} cy={162} r={17} stroke={ODIM} strokeWidth={1} fill="none"/>
      <ellipse cx={248} cy={100} rx={62} ry={19} stroke={ORANGE} strokeWidth={2} fill="none"/>
      <path d="M 152 126 Q 174 116 218 118 Q 234 120 238 128 Q 218 136 168 136 Q 152 133 152 126" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <path d="M 90 147 Q 100 130 128 128 Q 158 128 163 143" stroke={ODIM} strokeWidth={1.2} fill="none"/>
      <path d="M 344 176 Q 358 160 376 153 Q 398 148 413 164" stroke={ODIM} strokeWidth={1.2} fill="none"/>
      <path d="M 306 72 Q 325 60 345 72 Q 350 75 348 80" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <line x1={304} y1={72} x2={312} y2={82} stroke={ORANGE} strokeWidth={1.5}/>
      <circle cx={404} cy={170} r={14} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <circle cx={404} cy={170} r={8} stroke={ODIM} strokeWidth={1} fill="none"/>
      <path d="M 268 182 Q 298 192 310 188 Q 342 178 358 183 Q 378 190 392 198" stroke={ORANGE} strokeWidth={2.5} fill="none"/>
      <line x1={190} y1={185} x2={215} y2={185} stroke={ORANGE} strokeWidth={2}/>
    </g>
  );
}

function ChopperSVG() {
  return (
    <g transform="translate(5,-5)">
      <Wheel cx={105} cy={198} r={56}/>
      <Wheel cx={405} cy={205} r={44} spokes={20}/>
      <line x1={322} y1={68} x2={398} y2={205} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={334} y1={68} x2={410} y2={205} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={340} y1={100} x2={356} y2={100} stroke={ODIM} strokeWidth={1}/>
      <line x1={348} y1={130} x2={364} y2={135} stroke={ODIM} strokeWidth={1}/>
      <line x1={356} y1={162} x2={374} y2={167} stroke={ODIM} strokeWidth={1}/>
      <line x1={326} y1={62} x2={168} y2={90} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={168} y1={90} x2={138} y2={130} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={138} y1={130} x2={148} y2={165} stroke={ORANGE} strokeWidth={2}/>
      <line x1={148} y1={165} x2={105} y2={198} stroke={ORANGE} strokeWidth={2}/>
      <line x1={168} y1={90} x2={160} y2={165} stroke={ORANGE} strokeWidth={1.8}/>
      <line x1={160} y1={165} x2={105} y2={198} stroke={ODIM} strokeWidth={1.5}/>
      <line x1={326} y1={62} x2={195} y2={165} stroke={ORANGE} strokeWidth={2}/>
      <line x1={195} y1={165} x2={105} y2={198} stroke={ORANGE} strokeWidth={1.8}/>
      <line x1={200} y1={148} x2={188} y2={95} stroke={ORANGE} strokeWidth={4}/>
      {[0,1,2,3,4].map(i=><line key={i} x1={183+i} y1={130-i*7} x2={200+i} y2={130-i*7} stroke={ODIM} strokeWidth={1}/>)}
      <line x1={240} y1={148} x2={245} y2={88} stroke={ORANGE} strokeWidth={4}/>
      {[0,1,2,3,4].map(i=><line key={i} x1={240} y1={126-i*7} x2={258} y2={126-i*7} stroke={ODIM} strokeWidth={1}/>)}
      <path d="M 178 148 Q 178 168 200 175 Q 230 180 255 175 Q 272 168 272 148 Z" stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <ellipse cx={210} cy={165} rx={22} ry={16} stroke={ODIM} strokeWidth={1} fill="none"/>
      <circle cx={210} cy={165} r={8} stroke={OWEAK} strokeWidth={1} fill="none"/>
      <path d="M 168 85 Q 200 72 265 75 Q 310 77 326 68 Q 330 72 330 78 Q 318 88 275 90 Q 220 92 175 95 Q 165 94 168 85" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <path d="M 140 118 Q 158 108 195 108 Q 210 108 215 116 Q 200 124 162 126 Q 143 126 140 118" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <line x1={140} y1={118} x2={132} y2={88} stroke={ORANGE} strokeWidth={1.5}/>
      <line x1={146} y1={118} x2={138} y2={88} stroke={ODIM} strokeWidth={1}/>
      <path d="M 132 88 Q 135 82 138 88" stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <line x1={290} y1={58} x2={290} y2={32} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={290} y1={32} x2={260} y2={32} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={290} y1={32} x2={320} y2={32} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={260} y1={32} x2={257} y2={40} stroke={ORANGE} strokeWidth={2}/>
      <line x1={320} y1={32} x2={323} y2={40} stroke={ORANGE} strokeWidth={2}/>
      <line x1={258} y1={36} x2={248} y2={43} stroke={ODIM} strokeWidth={1.5}/>
      <line x1={322} y1={36} x2={332} y2={43} stroke={ODIM} strokeWidth={1.5}/>
      <rect x={330} y={108} width={18} height={28} rx={2} stroke={ODIM} strokeWidth={1} fill="none"/>
      <ellipse cx={415} cy={178} rx={16} ry={12} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <ellipse cx={415} cy={178} rx={9} ry={7} stroke={ODIM} strokeWidth={1} fill="none"/>
      <path d="M 255 173 Q 280 180 300 177 Q 340 170 370 175 Q 392 180 405 192 Q 415 202 418 210" stroke={ORANGE} strokeWidth={2.8} fill="none"/>
      <path d="M 405 187 Q 416 195 422 206 Q 416 210 405 205 Q 410 198 405 192" stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <path d="M 105 143 Q 118 128 148 126 Q 168 126 168 140 Q 155 150 128 152 Q 108 150 105 143" stroke={ODIM} strokeWidth={1.2} fill="none"/>
      <line x1={218} y1={178} x2={248} y2={198} stroke={ODIM} strokeWidth={1.5}/>
      <line x1={245} y1={195} x2={262} y2={195} stroke={ORANGE} strokeWidth={2}/>
    </g>
  );
}

function SportbikeSVG() {
  return (
    <g transform="translate(8,-5)">
      <Wheel cx={82} cy={200} r={50}/>
      <Wheel cx={398} cy={200} r={50}/>
      <line x1={360} y1={105} x2={396} y2={200} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={370} y1={105} x2={406} y2={200} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={362} y1={100} x2={238} y2={120} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={238} y1={120} x2={208} y2={178} stroke={ORANGE} strokeWidth={2}/>
      <line x1={208} y1={178} x2={82} y2={200} stroke={ORANGE} strokeWidth={1.8}/>
      <line x1={362} y1={100} x2={288} y2={170} stroke={ORANGE} strokeWidth={2}/>
      <line x1={288} y1={170} x2={208} y2={178} stroke={ODIM} strokeWidth={1.5}/>
      <line x1={238} y1={120} x2={172} y2={100} stroke={ORANGE} strokeWidth={2}/>
      <line x1={172} y1={100} x2={155} y2={140} stroke={ORANGE} strokeWidth={1.8}/>
      <line x1={155} y1={140} x2={208} y2={178} stroke={ODIM} strokeWidth={1.5}/>
      <rect x={212} y={130} width={92} height={50} rx={2} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <rect x={212} y={98} width={92} height={34} rx={2} stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      {[0,1,2,3].map(i=><rect key={i} x={218+i*21} y={88} width={13} height={12} rx={1} stroke={ORANGE} strokeWidth={1.2} fill="none"/>)}
      <path d="M 238 108 Q 270 86 318 90 Q 348 94 362 105 Q 350 112 300 116 Q 262 116 238 108" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <path d="M 362 100 Q 392 88 420 110 Q 430 130 424 162 Q 418 182 408 190 Q 398 160 384 140 Q 370 118 362 100" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <ellipse cx={404} cy={118} rx={9} ry={6} stroke={ODIM} strokeWidth={1.2} fill="none"/>
      <path d="M 172 100 Q 142 85 118 90 Q 104 96 108 115 Q 114 135 152 140" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <path d="M 362 100 Q 375 84 394 86 Q 408 90 418 108" stroke={ODIM} strokeWidth={1} fill="none"/>
      <line x1={342} y1={88} x2={375} y2={88} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={362} y1={83} x2={362} y2={93} stroke={ORANGE} strokeWidth={2}/>
      {[0,1,2,3].map(i=><line key={i} x1={310+i*4} y1={178} x2={355} y2={192} stroke={ODIM} strokeWidth={1}/>)}
      <path d="M 355 188 Q 378 190 398 195 Q 408 198 412 205" stroke={ORANGE} strokeWidth={2.5} fill="none"/>
    </g>
  );
}

function AdventureSVG() {
  return (
    <g transform="translate(10,-10)">
      <Wheel cx={88} cy={200} r={54} spokes={18}/>
      <Wheel cx={395} cy={200} r={52} spokes={18}/>
      <line x1={354} y1={82} x2={393} y2={200} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={365} y1={82} x2={404} y2={200} stroke={ORANGE} strokeWidth={2.2}/>
      <rect x={355} y={100} width={18} height={32} rx={3} stroke={ODIM} strokeWidth={1} fill="none"/>
      <line x1={356} y1={78} x2={205} y2={95} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={205} y1={95} x2={168} y2={135} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={168} y1={135} x2={88} y2={200} stroke={ORANGE} strokeWidth={2}/>
      <line x1={356} y1={78} x2={248} y2={172} stroke={ORANGE} strokeWidth={2}/>
      <line x1={248} y1={172} x2={88} y2={200} stroke={ORANGE} strokeWidth={1.8}/>
      <line x1={205} y1={95} x2={168} y2={72} stroke={ORANGE} strokeWidth={2}/>
      <line x1={168} y1={72} x2={148} y2={138} stroke={ORANGE} strokeWidth={1.8}/>
      <rect x={220} y={125} width={82} height={52} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <line x1={232} y1={125} x2={228} y2={88} stroke={ORANGE} strokeWidth={3}/>
      <line x1={268} y1={125} x2={264} y2={88} stroke={ORANGE} strokeWidth={3}/>
      {[0,1,2,3].map(i=><line key={i} x1={224} y1={118-i*8} x2={238} y2={118-i*8} stroke={ODIM} strokeWidth={0.9}/>)}
      {[0,1,2,3].map(i=><line key={i} x1={260} y1={118-i*8} x2={274} y2={118-i*8} stroke={ODIM} strokeWidth={0.9}/>)}
      <path d="M 205 88 Q 245 72 310 76 Q 345 80 356 88 Q 345 102 295 106 Q 248 106 205 96 Z" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <path d="M 356 78 Q 374 58 398 62 Q 415 68 420 88 Q 415 110 408 128" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <path d="M 168 118 Q 196 104 220 104 Q 238 104 240 112 Q 220 125 182 128 Q 166 127 168 118" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <line x1={335} y1={72} x2={368} y2={72} stroke={ORANGE} strokeWidth={2.5}/>
      <path d="M 335 70 Q 322 65 318 72 Q 322 79 335 74" stroke={ODIM} strokeWidth={1.2} fill="none"/>
      <path d="M 368 70 Q 382 65 386 72 Q 382 79 368 74" stroke={ODIM} strokeWidth={1.2} fill="none"/>
      <rect x={112} y={148} width={48} height={38} rx={3} stroke={ODIM} strokeWidth={1.2} fill="none"/>
      <path d="M 302 177 Q 325 172 345 168 Q 370 164 385 160 Q 400 158 410 162" stroke={ORANGE} strokeWidth={2.5} fill="none"/>
    </g>
  );
}

function DirtbikeSVG() {
  return (
    <g transform="translate(15,-15)">
      <Wheel cx={85} cy={205} r={52} spokes={20}/>
      <Wheel cx={380} cy={205} r={50} spokes={20}/>
      <line x1={350} y1={80} x2={378} y2={205} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={361} y1={80} x2={389} y2={205} stroke={ORANGE} strokeWidth={2.2}/>
      <rect x={350} y={88} width={18} height={42} rx={3} stroke={ODIM} strokeWidth={1} fill="none"/>
      <line x1={352} y1={76} x2={220} y2={88} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={220} y1={88} x2={178} y2={118} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={178} y1={118} x2={145} y2={155} stroke={ORANGE} strokeWidth={2}/>
      <line x1={145} y1={155} x2={85} y2={205} stroke={ORANGE} strokeWidth={2}/>
      <line x1={352} y1={76} x2={268} y2={162} stroke={ORANGE} strokeWidth={2.2}/>
      <line x1={268} y1={162} x2={145} y2={162} stroke={ORANGE} strokeWidth={2}/>
      <line x1={220} y1={88} x2={178} y2={62} stroke={ORANGE} strokeWidth={2}/>
      <line x1={178} y1={62} x2={155} y2={120} stroke={ORANGE} strokeWidth={1.8}/>
      <line x1={222} y1={125} x2={215} y2={72} stroke={ORANGE} strokeWidth={4.5}/>
      {[0,1,2,3,4,5].map(i=><line key={i} x1={210} y1={118-i*7} x2={228} y2={118-i*7} stroke={ODIM} strokeWidth={0.9}/>)}
      <rect x={198} y={125} width={82} height={42} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <rect x={162} y={88} width={52} height={35} rx={4} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <path d="M 178 80 Q 220 64 290 68 Q 330 72 352 80 Q 335 95 285 98 Q 232 98 178 88 Z" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <path d="M 155 110 Q 182 98 222 98 Q 245 98 248 108 Q 225 120 180 122 Q 158 122 155 110" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <line x1={310} y1={68} x2={368} y2={68} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={339} y1={62} x2={339} y2={75} stroke={ORANGE} strokeWidth={2}/>
      <path d="M 278 167 Q 305 158 330 148 Q 358 138 375 130 Q 390 124 405 128" stroke={ORANGE} strokeWidth={2.8} fill="none"/>
    </g>
  );
}

function ScooterSVG() {
  return (
    <g transform="translate(30,0)">
      <Wheel cx={88} cy={200} r={40} spokes={16}/>
      <Wheel cx={370} cy={200} r={40} spokes={16}/>
      <path d="M 345 140 Q 358 120 370 110 Q 385 102 395 112 Q 405 125 400 152 Q 395 175 370 190 Q 350 195 330 192" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <path d="M 330 192 Q 285 198 240 198 Q 200 198 172 195 Q 152 190 140 178 Q 130 165 132 148 Q 135 132 148 122" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <path d="M 148 122 Q 162 108 185 98 Q 210 88 242 84 Q 270 80 300 82 Q 328 86 345 100 Q 348 108 346 120 Q 344 132 330 138 Q 295 145 260 145 Q 225 148 200 155 Q 175 162 162 175 Q 152 185 155 195" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <path d="M 300 78 Q 318 60 338 58 Q 355 58 362 72 Q 365 82 358 94" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <ellipse cx={390} cy={128} rx={12} ry={10} stroke={ORANGE} strokeWidth={1.5} fill="none"/>
      <ellipse cx={390} cy={128} rx={7} ry={6} stroke={ODIM} strokeWidth={1} fill="none"/>
      <line x1={325} y1={80} x2={365} y2={80} stroke={ORANGE} strokeWidth={2.5}/>
      <line x1={345} y1={72} x2={345} y2={88} stroke={ORANGE} strokeWidth={2}/>
      <path d="M 175 130 Q 215 118 275 118 Q 310 118 330 126 Q 315 140 265 142 Q 215 142 178 138 Q 168 135 175 130" stroke={ORANGE} strokeWidth={1.8} fill="none"/>
      <path d="M 142 185 Q 115 185 100 190 Q 92 195 95 200" stroke={ORANGE} strokeWidth={2} fill="none"/>
      <line x1={148} y1={198} x2={220} y2={198} stroke={ORANGE} strokeWidth={2.5}/>
    </g>
  );
}

const BIKES = {
  cruiser:   { label:"Cruiser",   desc:"V-Twin · Low & Wide",          Component:CruiserSVG,   makes:["Harley-Davidson","Indian","Honda","Yamaha","Kawasaki"], models:{"Harley-Davidson":["Road King","Street Glide","Fat Boy","Sportster","Road Glide"],"Indian":["Chief","Scout","Challenger","Springfield"],"Honda":["Gold Wing","Shadow","Rebel"],"Yamaha":["V-Star 1300","Bolt","Raider"],"Kawasaki":["Vulcan 1700","Vulcan S"]} },
  chopper:   { label:"Chopper",   desc:"Extended Forks · Ape Hangers", Component:ChopperSVG,   makes:["Harley-Davidson","Indian","Custom Build","West Coast Choppers"], models:{"Harley-Davidson":["Softail Slim","Fat Bob","Low Rider","Street Bob"],"Indian":["Chief Dark Horse","Super Chief"],"Custom Build":["Rigid Frame","Softail Custom","Hardtail"],"West Coast Choppers":["El Diablo","Jesse James Custom"]} },
  sport:     { label:"Sportbike", desc:"Inline-4 · Full Fairing",      Component:SportbikeSVG, makes:["Honda","Yamaha","Kawasaki","Suzuki","Ducati","BMW"], models:{"Honda":["CBR1000RR","CBR600RR","CBR500R"],"Yamaha":["YZF-R1","YZF-R6","YZF-R3"],"Kawasaki":["Ninja ZX-10R","Ninja ZX-6R","Ninja 400"],"Suzuki":["GSX-R1000","GSX-R750","GSX-R600"],"Ducati":["Panigale V4","Panigale V2"],"BMW":["S 1000 RR","M 1000 RR"]} },
  adventure: { label:"Adventure", desc:"Parallel Twin · Long Travel",  Component:AdventureSVG, makes:["BMW","KTM","Honda","Yamaha","Triumph"], models:{"BMW":["R 1250 GS","F 850 GS","F 750 GS"],"KTM":["1290 Super Adventure","890 Adventure","390 Adventure"],"Honda":["Africa Twin","CB500X"],"Yamaha":["Ténéré 700","Super Ténéré"],"Triumph":["Tiger 1200","Tiger 900"]} },
  dirt:      { label:"Dirt Bike", desc:"Single Cyl · Motocross",       Component:DirtbikeSVG,  makes:["Honda","Yamaha","KTM","Kawasaki","Husqvarna"], models:{"Honda":["CRF450R","CRF250R","CRF125F"],"Yamaha":["YZ450F","YZ250F","WR450F"],"KTM":["450 SX-F","250 SX-F","350 EXC-F"],"Kawasaki":["KX450","KX250","KLX300R"],"Husqvarna":["FC 450","FC 350","FE 350"]} },
  scooter:   { label:"Scooter",   desc:"Automatic · Step-Through",     Component:ScooterSVG,   makes:["Honda","Yamaha","Vespa","Kymco","Piaggio"], models:{"Honda":["PCX","Forza","ADV350","Ruckus"],"Yamaha":["XMAX","NMAX","Zuma"],"Vespa":["GTS 300","Primavera","Sprint"],"Kymco":["Like 200","Downtown 350"],"Piaggio":["MP3","Liberty","Typhoon"]} },
};

const YEARS = Array.from({length:30},(_,i)=>2025-i);

function BikeCard({ bike, selected, onSelect, onRemove }) {
  const Comp = BIKES[bike.type]?.Component;
  return (
    <div className={`garage-card shimmer-enter ${selected?"primary-card":""}`} onClick={()=>onSelect(bike.id)}>
      {selected && <div className="primary-badge">PRIMARY</div>}
      <div className="card-thumb">
        <svg viewBox="0 0 480 250" width="100%" style={{maxHeight:90}}>
          <defs><filter id={`g${bike.id}`}><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g filter={`url(#g${bike.id})`}>{Comp && <Comp/>}</g>
        </svg>
      </div>
      <div className="card-body">
        <div className="card-year">{bike.year}</div>
        <div className="card-name">{bike.make} {bike.model}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
          <div className="card-type">{BIKES[bike.type]?.label}</div>
          <button className="remove-btn" onClick={e=>{e.stopPropagation();onRemove(bike.id);}}>REMOVE</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [garage, setGarage] = useState([
    {id:1,type:"cruiser",year:2021,make:"Harley-Davidson",model:"Road King"},
    {id:2,type:"chopper",year:2019,make:"Custom Build",model:"Hardtail"},
  ]);
  const [primaryId, setPrimaryId] = useState(1);
  const [selectedType, setSelectedType] = useState("cruiser");
  const [previewKey, setPreviewKey] = useState(0);
  const [form, setForm] = useState({year:2022,make:"",model:"",nickname:""});
  const [justAdded, setJustAdded] = useState(false);

  const makes = BIKES[selectedType]?.makes||[];
  const models = form.make?(BIKES[selectedType]?.models[form.make]||[]):[];

  function selectType(t){setSelectedType(t);setForm(f=>({...f,make:"",model:""}));setPreviewKey(k=>k+1);}
  function addBike(){
    if(!form.make||!form.model)return;
    const id=Date.now();
    setGarage(g=>[...g,{id,type:selectedType,year:form.year,make:form.make,model:form.model}]);
    setJustAdded(true);setPreviewKey(k=>k+1);
    setForm({year:2022,make:"",model:"",nickname:""});
    setTimeout(()=>setJustAdded(false),3000);
  }

  const Prev = BIKES[selectedType]?.Component;

  return (
    <>
      <style>{style}</style>
      <div className="garage-root blueprint-bg">

        {/* Header */}
        <div style={{marginBottom:24,display:"flex",alignItems:"baseline",gap:16,flexWrap:"wrap"}}>
          <h1 style={{fontFamily:"'Rajdhani',sans-serif",fontSize:28,fontWeight:700,color:"#f1f5f9",letterSpacing:"0.03em"}}>MY GARAGE</h1>
          <span className="section-label">{garage.length} VEHICLE{garage.length!==1?"S":""} REGISTERED</span>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20,alignItems:"start"}}>

          {/* LEFT */}
          <div style={{display:"flex",flexDirection:"column",gap:18}}>

            {/* Preview canvas */}
            <div className="bike-canvas-wrap">
              <div className="corner-mark tl"/><div className="corner-mark tr"/>
              <div className="corner-mark bl"/><div className="corner-mark br"/>
              <div className="scan-line"/>
              <div style={{position:"absolute",inset:0,pointerEvents:"none",backgroundImage:"linear-gradient(rgba(249,115,22,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(249,115,22,0.03) 1px,transparent 1px)",backgroundSize:"28px 28px"}}/>
              <div style={{position:"absolute",bottom:"18%",left:"10%",right:"10%",height:"28%",background:"radial-gradient(ellipse,rgba(249,115,22,0.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
              <svg key={previewKey} viewBox="0 0 480 250" width="100%" style={{display:"block",padding:"20px 12px"}}>
                <defs><filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <g filter="url(#glow)">{Prev && <Prev/>}</g>
                <line x1={40} y1={248} x2={440} y2={248} stroke="rgba(249,115,22,0.15)" strokeWidth={1} strokeDasharray="4 4"/>
              </svg>
              <div style={{padding:"0 16px 14px",display:"flex",justifyContent:"space-between"}}>
                <span className="section-label">{BIKES[selectedType]?.desc}</span>
                <span className="section-label" style={{color:"#374151"}}>BLUEPRINT</span>
              </div>
            </div>

            {/* Garage grid */}
            {garage.length>0&&(
              <div>
                <div className="section-label" style={{marginBottom:10}}>Saved Vehicles</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
                  {garage.map(b=>(
                    <BikeCard key={b.id} bike={b} selected={b.id===primaryId}
                      onSelect={setPrimaryId} onRemove={id=>setGarage(g=>g.filter(x=>x.id!==id))}/>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Add form */}
          <div style={{background:"#0d0f10",border:"1px solid rgba(249,115,22,0.12)",borderRadius:12,padding:20,position:"sticky",top:20}}>
            <div className="section-label" style={{marginBottom:14}}>Add Vehicle</div>

            {/* Type pills */}
            <div style={{marginBottom:18}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,letterSpacing:"0.15em",color:"#4b5563",marginBottom:8}}>VEHICLE TYPE</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {Object.entries(BIKES).map(([k,v])=>(
                  <button key={k} className={`type-btn ${selectedType===k?"active":""}`} onClick={()=>selectType(k)}>{v.label}</button>
                ))}
              </div>
            </div>

            <div className="field-wrap" style={{marginBottom:12}}>
              <label>Year</label>
              <select value={form.year} onChange={e=>setForm(f=>({...f,year:+e.target.value}))}>
                {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="field-wrap" style={{marginBottom:12}}>
              <label>Make</label>
              <select value={form.make} onChange={e=>setForm(f=>({...f,make:e.target.value,model:""}))}>
                <option value="">Select make...</option>
                {makes.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field-wrap" style={{marginBottom:12}}>
              <label>Model</label>
              <select value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))} disabled={!form.make}>
                <option value="">Select model...</option>
                {models.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field-wrap" style={{marginBottom:18}}>
              <label>Nickname <span style={{color:"#374151",fontWeight:400}}>(optional)</span></label>
              <input value={form.nickname} onChange={e=>setForm(f=>({...f,nickname:e.target.value}))} placeholder='"The Daily", "Track Bike"'/>
            </div>

            {/* Points promo */}
            <div style={{background:"rgba(249,115,22,0.06)",border:"1px solid rgba(249,115,22,0.18)",borderRadius:8,padding:"10px 12px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:20,color:"#f97316",fontWeight:700}}>+</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#f97316"}}>100 POINTS</div>
                <div style={{fontSize:10,color:"#6b7280",marginTop:1}}>Earned for adding a vehicle</div>
              </div>
            </div>

            <button className="add-btn" onClick={addBike} disabled={!form.make||!form.model}>
              ADD TO GARAGE
            </button>

            {justAdded&&(
              <div style={{marginTop:10,textAlign:"center",fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:"#f97316",animation:"fadeGlow 0.3s ease forwards"}}>
                ✓ VEHICLE REGISTERED — 100 PTS AWARDED
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
