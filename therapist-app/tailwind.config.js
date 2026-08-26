/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Small phones need one step below Tailwind's `sm`.
        xs: '400px',
      },
      colors: {
        forest: {
          DEFAULT: '#183C32',
          deep: '#122E27',
          accent: '#285447',
          soft: '#2F614F',
        },
        sage: {
          DEFAULT: '#92A99C',
          soft: '#DDE7E0',
          wash: '#EDF2EE',
          line: '#E3EAE4',
        },
        cream: '#F7F4EC',
        ivory: '#FCFBF7',
        ink: {
          DEFAULT: '#1D2924',
          soft: '#5A6E65',
          faint: '#8B9B92',
        },
        amber: {
          DEFAULT: '#E6A15C',
          deep: '#B87A34',
          wash: '#FBF2E7',
          line: '#F0DFC6',
        },
        rose: {
          DEFAULT: '#D97770',
          deep: '#B4554E',
          wash: '#FBEDEC',
          line: '#F1D7D5',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Metadata sizes read from the references.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      letterSpacing: {
        eyebrow: '0.14em',
      },
      borderRadius: {
        card: '12px',
        control: '8px',
      },
      boxShadow: {
        // Depth comes from surface, border and space — not from shadow.
        card: '0 1px 2px rgba(24, 60, 50, 0.03)',
        raised: '0 4px 16px -6px rgba(24, 60, 50, 0.18)',
        panel: '-24px 0 60px -30px rgba(24, 60, 50, 0.28)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(0.86)', opacity: '0.5' },
          '50%': { transform: 'scale(1)', opacity: '0.9' },
        },
      },
      animation: {
        'fade-in': 'fade-in 240ms ease-out both',
        rise: 'rise 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-up': 'slide-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        // The approved completion feedback: calm, ~300ms, no celebration.
        complete: 'scale-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        breathe: 'breathe 8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
