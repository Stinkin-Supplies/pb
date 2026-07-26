'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Animated tabs component — sliding gold indicator, 3D perspective content transition.
 *
 * Props:
 *   tabs: Array<{ title: string, value: string, badge?: string|number, content: ReactNode }>
 *   defaultValue?: string  — value of the tab to open by default
 */
export function Tabs({ tabs, defaultValue }) {
  const [active, setActive] = useState(defaultValue ?? tabs[0]?.value);
  const [direction, setDirection] = useState(1);

  const activeIdx = tabs.findIndex(t => t.value === active);
  const activeTab = tabs[activeIdx] ?? tabs[0];

  function switchTab(value) {
    const nextIdx = tabs.findIndex(t => t.value === value);
    setDirection(nextIdx > activeIdx ? 1 : -1);
    setActive(value);
  }

  return (
    <div style={{ width: '100%' }}>
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 3,
        padding: '5px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(197,167,34,0.30)',
        width: '100%',
        position: 'relative',
      }}>
        {tabs.map(tab => {
          const isActive = tab.value === active;
          return (
            <button
              key={tab.value}
              onClick={() => switchTab(tab.value)}
              style={{
                position: 'relative',
                flex: 1,
                padding: '14px 20px',
                fontFamily: 'var(--font-stencil)',
                fontSize: 13,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: isActive ? '#0c0a06' : '#908070',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                zIndex: 1,
                transition: 'color 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
              }}
            >
              {/* Sliding background pill */}
              {isActive && (
                <motion.div
                  layoutId="tab-pill"
                  transition={{ type: 'spring', stiffness: 400, damping: 38 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: '#c9a84c',
                    zIndex: -1,
                  }}
                />
              )}
              {tab.title}
              {tab.badge != null && (
                <span style={{
                  fontFamily: 'var(--font-stencil)',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  color: isActive ? 'rgba(12,10,6,0.65)' : 'rgba(197,167,34,0.6)',
                  background: isActive ? 'rgba(0,0,0,0.14)' : 'rgba(197,167,34,0.10)',
                  padding: '2px 7px',
                  lineHeight: 1.5,
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content — 3D perspective container ───────────────────────────── */}
      <div style={{ position: 'relative', marginTop: 0, perspective: '1000px' }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeTab?.value}
            custom={direction}
            initial={{ opacity: 0, y: 10, rotateX: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  rotateX: 0, scale: 1    }}
            exit={{    opacity: 0, y: -6, rotateX: -4, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d' }}
          >
            {activeTab?.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
