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
    const MAX = 90;

    const spawn = (atBottom = true) => ({
      x:       Math.random() * canvas.width,
      y:       atBottom ? canvas.height + 130 + Math.random() * 40 : Math.random() * canvas.height,
      vx:      (Math.random() - 0.5) * 0.55,
      vy:      -(Math.random() * 0.9 + 0.35),
      r:       Math.random() * 130 + 70,
      alpha:   atBottom ? 0 : Math.random() * 0.22 + 0.08,
      maxAlpha:Math.random() * 0.42 + 0.26,
      grow:    Math.random() * 0.28 + 0.08,
      fade:    Math.random() * 0.00035 + 0.00015,
      phase:   atBottom ? 'in' : 'float',
    });

    for (let i = 0; i < MAX; i++) particles.push(spawn(false));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fire-bed glow at the bottom of the viewport
      const baseGlow = ctx.createLinearGradient(0, canvas.height * 0.78, 0, canvas.height);
      baseGlow.addColorStop(0, 'rgba(220,180,70,0)');
      baseGlow.addColorStop(0.35, 'rgba(220,180,70,0.1)');
      baseGlow.addColorStop(0.7, 'rgba(235,170,65,0.16)');
      baseGlow.addColorStop(1, 'rgba(225,140,50,0.2)');
      ctx.fillStyle = baseGlow;
      ctx.fillRect(0, canvas.height * 0.78, canvas.width, canvas.height * 0.22);

      for (const p of particles) {
        // Lifecycle
        if (p.phase === 'in') {
          p.alpha += 0.0018;
          if (p.alpha >= p.maxAlpha) p.phase = 'float';
        } else {
          p.alpha -= p.fade;
        }
        p.r  += p.grow;
        // add sideways turbulence that increases as smoke rises
        const lift = Math.max(0, 1 - p.y / canvas.height);
        p.x  += p.vx + Math.sin((p.y + p.x) * 0.01) * (0.22 + lift * 0.55);
        p.y  += p.vy;

        // Respawn when fully faded or off top
        if (p.alpha <= 0 || p.y < -p.r * 2) {
          Object.assign(p, spawn(true));
          continue;
        }

        // Draw radial gradient puff — warm grey/gold tinted smoke
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0,   `rgba(245,214,145,${p.alpha})`);
        g.addColorStop(0.24,`rgba(225,185,112,${p.alpha * 0.86})`);
        g.addColorStop(0.52, `rgba(170,132,88,${p.alpha * 0.56})`);
        g.addColorStop(0.8, `rgba(92,76,60,${p.alpha * 0.22})`);
        g.addColorStop(1,   `rgba(40,32,26,0)`);

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
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}


export default SmokeBackground;
