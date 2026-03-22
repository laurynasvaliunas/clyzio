/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable dark mode (Phase 24)
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Clyzio Brand Colors - UNIFIED (Phase 27)
        "clyzio-primary": "#26C6DA",    // Unified Cyan
        "clyzio-accent": "#FDD835",     // Yellow sun
        "clyzio-dark": "#006064",       // Darker teal for text
        "clyzio-light": "#E0F7FA",      // Light teal background
        // Legacy colors (updated to match)
        primary: "#26C6DA",
        "primary-dark": "#00838F",
        background: "#F5FAFA",
        surface: "#FFFFFF",
        "text-primary": "#006064",
        "text-secondary": "#546E7A",
      },
      boxShadow: {
        "clyzio": "0 4px 20px rgba(38, 198, 218, 0.25)",
        "clyzio-lg": "0 8px 30px rgba(38, 198, 218, 0.3)",
      },
    },
  },
  plugins: [],
};
