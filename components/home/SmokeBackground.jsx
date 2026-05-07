'use client';

import { useEffect, useRef } from 'react';

// ─── Smoke Background ─────────────────────────────────────────────────────────
function SmokeBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Each particle is a soft radial smoke puff
    const particles = [];
    const MAX = 40;

    const spawn = (atBottom = true) => ({
      x:       Math.random() * canvas.width,
      y:       atBottom ? canvas.height + 80 : Math.random() * canvas.height,
      vx:      (Math.random() - 0.5) * 0.35,
      vy:      -(Math.random() * 0.45 + 0.15),
      r:       Math.random() * 200 + 120,
      alpha:   atBottom ? 0 : Math.random() * 0.22 + 0.08,
      maxAlpha:Math.random() * 0.28 + 0.12,
      grow:    Math.random() * 0.25 + 0.08,
      fade:    Math.random() * 0.00035 + 0.00015,
      phase:   atBottom ? 'in' : 'float',
    });

    for (let i = 0; i < MAX; i++) particles.push(spawn(false));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        // Lifecycle
        if (p.phase === 'in') {
          p.alpha += 0.0008;
          if (p.alpha >= p.maxAlpha) p.phase = 'float';
        } else {
          p.alpha -= p.fade;
        }
        p.r  += p.grow;
        p.x  += p.vx;
        p.y  += p.vy;

        // Respawn when fully faded or off top
        if (p.alpha <= 0 || p.y < -p.r * 2) {
          Object.assign(p, spawn(true));
          continue;
        }

        // Draw radial gradient puff — warm grey/gold tinted smoke
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0,   `rgba(210,190,140,${p.alpha})`);
        g.addColorStop(0.35,`rgba(170,155,120,${p.alpha * 0.7})`);
        g.addColorStop(0.7, `rgba(100,90,75,${p.alpha * 0.3})`);
        g.addColorStop(1,   `rgba(50,45,35,0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Spawn new ones to keep count up
      while (particles.length < MAX) particles.push(spawn(true));

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}


export default SmokeBackground;