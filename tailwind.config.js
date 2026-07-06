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
        "clyzio-primary": "#00565A",    // Unified Cyan
        "clyzio-accent": "#F59E0B",     // Yellow sun
        "clyzio-dark": "#003D40",       // Darker teal for text
        "clyzio-light": "#E6F1F2",      // Light teal background
        // Legacy colors (updated to match)
        primary: "#00565A",
        "primary-dark": "#00565A",
        background: "#F7F9FA",
        surface: "#FFFFFF",
        "text-primary": "#003D40",
        "text-secondary": "#5A6A6F",
      },
      boxShadow: {
        "clyzio": "0 4px 20px rgba(38, 198, 218, 0.25)",
        "clyzio-lg": "0 8px 30px rgba(38, 198, 218, 0.3)",
      },
    },
  },
  plugins: [],
};
