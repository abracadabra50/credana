import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',  // Pure black
        foreground: '#ffffff',  // Pure white
        card: '#0a0a0a',       // Very dark grey
        'card-foreground': '#ffffff',
        popover: '#0a0a0a',
        'popover-foreground': '#ffffff',
        primary: '#8b5cf6',    // Violet
        'primary-foreground': '#ffffff',
        secondary: '#0f0f0f',  // Nearly black
        'secondary-foreground': '#ffffff',
        muted: '#171717',      // Dark grey
        'muted-foreground': '#737373',  // Grey text
        accent: '#0ea5e9',     // Sky blue
        'accent-foreground': '#000000',
        destructive: '#dc2626', // Red
        'destructive-foreground': '#ffffff',
        border: '#1a1a1a',     // Subtle border
        input: '#0a0a0a',
        ring: '#8b5cf6',
        success: '#10b981',
        warning: '#f59e0b',
      },
      borderRadius: {
        none: '0',
        sm: '0',     // Sharp edges
        md: '0',     // Sharp edges
        lg: '0',     // Sharp edges
        xl: '0',     // Sharp edges
        '2xl': '0',  // Sharp edges
        '3xl': '0',  // Sharp edges
        full: '9999px', // Keep for specific elements like pills
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(139, 92, 246, 0.3)',
        'glow-lg': '0 0 40px rgba(139, 92, 246, 0.4)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config; 