/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Modern Dark (cinematic) — deep navy, never pure black.
        bg: '#0B1020',
        surface: '#0F172A',
        'surface-2': '#141D34',
        raised: '#1A2440',
        muted: '#1E2A44',
        fg: '#F8FAFC',
        'fg-muted': '#9AA7C0',
        'fg-subtle': '#67748F',
        border: 'rgba(255,255,255,0.08)',
        'border-strong': 'rgba(255,255,255,0.16)',
        primary: '#EC4899',
        'primary-600': '#DB2777',
        'primary-700': '#BE185D',
        accent: '#6366F1',
        'accent-600': '#4F46E5',
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#FB7185',
        'danger-600': '#E11D48',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 34px -14px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(236,72,153,0.35), 0 10px 44px -10px rgba(236,72,153,0.45)',
        'glow-accent': '0 0 0 1px rgba(99,102,241,0.35), 0 10px 44px -10px rgba(99,102,241,0.45)',
        'glow-success': '0 0 0 1px rgba(52,211,153,0.35), 0 10px 44px -12px rgba(52,211,153,0.4)',
      },
      backgroundImage: {
        'app-radial':
          'radial-gradient(1100px 560px at 78% -12%, rgba(236,72,153,0.12), transparent 60%), radial-gradient(920px 520px at 8% -8%, rgba(99,102,241,0.12), transparent 58%)',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(120%)' },
        },
        drift: {
          '0%': { transform: 'translate3d(-4%, -3%, 0) scale(1.08)' },
          '50%': { transform: 'translate3d(4%, 3%, 0) scale(1.14)' },
          '100%': { transform: 'translate3d(-4%, -3%, 0) scale(1.08)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        drift: 'drift 14s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
      transitionTimingFunction: {
        expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
