/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Small phones need one extra step below Tailwind's `sm`.
        xs: '400px',
      },
      colors: {
        forest: {
          DEFAULT: '#183C32',
          deep: '#122B24',
          900: '#183C32',
          700: '#214A3D',
          600: '#285447',
          500: '#356A5A',
        },
        sage: {
          DEFAULT: '#92A99C',
          400: '#92A99C',
          300: '#B4C4BA',
          200: '#DDE7E0',
          100: '#EAF0EB',
        },
        cream: '#F7F4EC',
        ivory: '#FCFBF7',
        ink: {
          DEFAULT: '#1D2924',
          muted: '#5A6E65',
          faint: '#8A9992',
        },
        amber: {
          soft: '#C99A4E',
          wash: '#F6EEDF',
        },
        rose: {
          soft: '#B08383',
          wash: '#F5EAEA',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', '"Cormorant Garamond"', 'ui-serif', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        widest2: '0.18em',
      },
      borderRadius: {
        xl2: '1.25rem',
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(24,60,50,0.04), 0 8px 24px -12px rgba(24,60,50,0.14)',
        lift: '0 2px 6px rgba(24,60,50,0.06), 0 24px 48px -24px rgba(24,60,50,0.28)',
        panel: '-24px 0 64px -32px rgba(24,60,50,0.35)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'rise': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'breathe': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.06)', opacity: '0.85' },
        },
      },
      animation: {
        'fade-in': 'fade-in 260ms ease-out both',
        rise: 'rise 320ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slide-in-right 320ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-up': 'slide-up 300ms cubic-bezier(0.22,1,0.36,1) both',
        breathe: 'breathe 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
