const { nextui } = require("@nextui-org/theme");

/** @type {import('tailwindcss').Config} */

module.exports = {
  darkMode: `class`,
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./layouts/**/*.{ts,tsx}",
    "./OS/**/*.{ts,tsx}",
    "./node_modules/@nextui-org/theme/dist/components/(progress|slider|popover).js",
  ],
  theme: {
    extend: {
      colors: {
        black: {
          DEFAULT: "#000",
          100: "#000319",
          200: "rgba(17, 25, 40, 0.75)",
          300: "rgba(255, 255, 255, 0.125)",
        },
        white: {
          DEFAULT: "#FFF",
          100: "#BEC1DD",
          200: "#C1C2D3",
          300: "#999999",
          400: "#666666",
          500: "#333333",
          600: "#000000",
        },
        blue: {
          100: "#E4ECFF",
          200: "#B3C6FF",
          300: "#80A0FF",
          400: "#4D7AFF",
          500: "#1A54FF",
          600: "#003ECC",
          700: "#002E99",
          800: "#001F66",
        },
        yellow: {
          100: "#FFFFCC",
          200: "#FFFF99",
          300: "#FFFF66",
          400: "#FFFF33",
          500: "#FFFF00",
        },
        purple: {
          DEFAULT: "#CBACF9",
          100: "#CBACF9",
          200: "#9783E6",
          300: "#635AD3",
          400: "#3F31C0",
          500: "#1B0DBD",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "#059669",
          foreground: "#ffffff",
        },
      },
      backgroundColor: {
        "black-100": "#000319",
        "black-200": "rgba(17, 25, 40, 0.75)",
        "black-300": "rgba(255, 255, 255, 0.125)",
        "white-100": "#BEC1DD",
        "white-200": "#C1C2D3",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fill: {
        "fill-primary": "hsl(223, 27%, 31%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "automation-zoom-in": {
          "0%": { transform: "translateY(-30px) scale(0.2)" },
          "100%": { transform: "transform: translateY(0px) scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "automation-zoom-in": "automation-zoom-in 0.5s",
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
        hypercho: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "Cantarell",
          "Fira Sans",
          "Droid Sans",
          "Helvetica Neue",
          "sans-serif",
        ],
        Roboto: ["Roboto"],
      },
      boxShadow: {
        companionShadow:
          "0 5px 15px rgba(51, 153, 255, 0.3), 0 10px 20px rgba(51, 153, 255, 0.2), 0 15px 30px rgba(51, 153, 255, 0.1)",
      },
      ringOffsetColor: {
        background: "#ffffff", // Your custom color
      },
    },
  },
  variants: {
    extend: {
      textColor: ["dark"],
    },
  },
  prefix: "",
  plugins: [
    require("tailwindcss-animate"),
    function ({ addUtilities }) {
      addUtilities({
        ".hide-marker::marker": {
          display: "none",
        },
        ".transform-gpu": {
          transform:
            "translate3d(var(--tw-translate-x), var(--tw-translate-y), 0) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))",
        },
      });
    },
    nextui(),
  ],
};
