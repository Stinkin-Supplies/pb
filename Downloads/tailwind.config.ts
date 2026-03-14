// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ─── BRAND COLORS ────────────────────────────────────────
      colors: {
        // Primary — Deep performance orange (powersports energy)
        primary: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',   // Main brand color
          600: '#ea6a0a',   // Hover state
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        // Neutral — True black & near-black for that performance look
        dark: {
          50:  '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#adb5bd',
          600: '#6c757d',
          700: '#495057',
          800: '#343a40',
          900: '#212529',
          950: '#0a0b0c',   // Near-black for backgrounds
        },
        // Accent — Chrome silver for premium feel
        chrome: {
          50:  '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
        },
        // Status colors
        success: {
          light: '#dcfce7',
          DEFAULT: '#16a34a',
          dark: '#14532d',
        },
        warning: {
          light: '#fef9c3',
          DEFAULT: '#ca8a04',
          dark: '#713f12',
        },
        danger: {
          light: '#fee2e2',
          DEFAULT: '#dc2626',
          dark: '#7f1d1d',
        },
        // MAP compliance colors
        map: {
          compliant: '#16a34a',
          atFloor: '#ca8a04',
          violation: '#dc2626',
          noMap: '#6b7280',
        },
      },

      // ─── TYPOGRAPHY ──────────────────────────────────────────
      fontFamily: {
        // Display: Strong, industrial feel — pair with body below
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        // Body: Clean, highly readable
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        // Mono: For part numbers, codes
        mono: ['var(--font-mono)', 'monospace'],
      },

      // ─── SPACING ─────────────────────────────────────────────
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },

      // ─── BORDER RADIUS ───────────────────────────────────────
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },

      // ─── BOX SHADOWS ─────────────────────────────────────────
      boxShadow: {
        'card': '0 2px 8px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.06)',
        'product': '0 4px 16px rgba(0,0,0,0.10)',
        'product-hover': '0 12px 32px rgba(0,0,0,0.16)',
        'admin': '0 1px 3px rgba(0,0,0,0.12)',
      },

      // ─── ANIMATIONS ──────────────────────────────────────────
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'points-pop': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.15)', color: '#f97316' },
          '100%': { transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'points-pop': 'points-pop 0.4s ease-in-out',
        'shimmer': 'shimmer 1.5s infinite linear',
      },

      // ─── SCREENS ─────────────────────────────────────────────
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
        '3xl': '1920px',
      },
    },
  },
  plugins: [
    // Add these to package.json:
    // @tailwindcss/forms @tailwindcss/typography @tailwindcss/aspect-ratio
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}

export default config
