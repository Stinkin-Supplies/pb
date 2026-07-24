'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Animated tabs component — sliding gold indicator, fade content transition.
 *
 * Props:
 *   tabs: Array<{ title: string, value: string, badge?: string|number, content: ReactNode }>
 *   defaultValue?: string  — value of the tab to open by default
 */
export function Tabs({ tabs, defaultValue }) {
  const [active, setActive] = useState(defaultValue ?? tabs[0]?.value);

  const activeTab = tabs.find(t => t.value === active) ?? tabs[0];

  return (
    <div style={{ width: '100%' }}>
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 2,
        padding: '4px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(197,167,34,0.14)',
        width: 'fit-content',
        position: 'relative',
      }}>
        {tabs.map(tab => {
          const isActive = tab.value === active;
          return (
            <button
              key={tab.value}
              onClick={() => setActive(tab.value)}
              style={{
                position: 'relative',
                padding: '9px 18px',
                fontFamily: 'var(--font-stencil)',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: isActive ? '#0c0a06' : '#706860',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                zIndex: 1,
                transition: 'color 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
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
                  fontSize: 8,
                  letterSpacing: '0.06em',
                  color: isActive ? 'rgba(12,10,6,0.6)' : 'rgba(197,167,34,0.5)',
                  background: isActive ? 'rgba(0,0,0,0.12)' : 'rgba(197,167,34,0.08)',
                  padding: '1px 5px',
                  lineHeight: 1.5,
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginTop: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab?.value}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab?.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
