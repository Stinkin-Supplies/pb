'use client';

import { useRouter } from 'next/navigation';

export default function BrowseBackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: '1px solid #2e2415',
        borderRadius: 6,
        padding: '6px 12px',
        cursor: 'pointer',
        fontFamily: 'var(--font-stencil)',
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#6b5a3a',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#c9a84c'; e.currentTarget.style.color = '#c9a84c'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2415'; e.currentTarget.style.color = '#6b5a3a'; }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Back
    </button>
  );
}
