'use client';

import { useEffect, useRef } from 'react';

/**
 * SmokeBlob — a dark, contained puff-of-smoke effect scoped to its parent
 * container (sized via ResizeObserver), rather than the full viewport like
 * SmokeBackground.jsx. Meant to sit behind a small area (e.g. the
 * subcategory option wheel) as a moody backdrop, not a page-level effect.
 */
function SmokeBlob({ className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let width = 0;
    let height = 0;

    const resize = () => {
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const particles = [];
    const MAX = 18;

    const spawn = (atBottom = true) => ({
      x: Math.random() * width,
      y: atBottom ? height + 60 + Math.random() * 40 : Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(Math.random() * 0.32 + 0.10),
      r: Math.random() * 90 + 55,
      alpha: atBottom ? 0 : Math.random() * 0.18 + 0.06,
      maxAlpha: Math.random() * 0.34 + 0.18,
      grow: Math.random() * 0.14 + 0.04,
      fade: Math.random() * 0.00038 + 0.00022,
      phase: atBottom ? 'in' : 'float',
    });

    for (let i = 0; i < MAX; i++) particles.push(spawn(false));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        if (p.phase === 'in') {
          p.alpha += 0.002;
          if (p.alpha >= p.maxAlpha) p.phase = 'float';
        } else {
          p.alpha -= p.fade;
        }
        p.r += p.grow;
        const lift = Math.max(0, 1 - p.y / height);
        p.x += p.vx + Math.sin((p.y + p.x) * 0.012) * (0.15 + lift * 0.3);
        p.y += p.vy;

        if (p.alpha <= 0 || p.y < -p.r * 2) {
          Object.assign(p, spawn(true));
          continue;
        }

        // Dark charcoal/black puff — no warm tint, unlike SmokeBackground
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0,   `rgba(58,54,48,${p.alpha})`);
        g.addColorStop(0.3, `rgba(36,33,29,${p.alpha * 0.85})`);
        g.addColorStop(0.6, `rgba(18,16,14,${p.alpha * 0.55})`);
        g.addColorStop(1,   'rgba(8,7,6,0)');

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      while (particles.length < MAX) particles.push(spawn(true));

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

export default SmokeBlob;
