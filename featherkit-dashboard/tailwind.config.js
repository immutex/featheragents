/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.125rem' }],
        xs: ['0.875rem', { lineHeight: '1.375rem' }],
        sm: ['1rem', { lineHeight: '1.5rem' }],
        base: ['1.0625rem', { lineHeight: '1.625rem' }],
        lg: ['1.1875rem', { lineHeight: '1.625rem' }],
        xl: ['1.375rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.75rem', { lineHeight: '2rem' }],
        '3xl': ['2.125rem', { lineHeight: '2.375rem' }],
        '4xl': ['2.75rem', { lineHeight: '3rem' }],
      },
      colors: {
        bg: '#050507',
        surface: '#09090c',
        elevated: '#0d0d11',
        card: '#111116',
        border: {
          DEFAULT: '#1a1a22',
          light: '#23232e',
        },
        ink: {
          DEFAULT: '#fafafa',
          2: '#a1a1aa',
          3: '#a1a1aa',
          4: '#71717a',
          5: '#52525b',
          6: '#3f3f46',
        },
        accent: {
          DEFAULT: '#22d3ee',
          dim: 'rgba(34,211,238,0.08)',
          glow: 'rgba(34,211,238,0.2)',
        },
        role: {
          frame: '#fbbf24',
          build: '#4ade80',
          critic: '#c084fc',
          sync: '#60a5fa',
        },
        ok: '#4ade80',
        warn: '#fbbf24',
        err: '#f87171',
        info: '#60a5fa',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['"Instrument Serif"', 'ui-serif', 'serif'],
      },
      letterSpacing: {
        tightish: '-0.005em',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'dash-flow': 'dash-flow 1.2s linear infinite',
        shimmer: 'shimmer 2s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        'pulse-soft': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
        'dash-flow': { to: { strokeDashoffset: '-16' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
};
