/** @type {import('tailwindcss').Config} */
// Colour tokens are duplicated in src/index.css (:root) so plain CSS can use them; keep both in sync.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f6f3",
        panel: "#ffffff",
        ink: "#121417",
        graphite: "#5e6470",
        rule: "#dadce0",
        "rule-strong": "#b9bdc6",
        signal: "#1f3bff",
        "signal-soft": "#e9ecff",
        amber: "#b8741a",
        "amber-soft": "#f5e9d7",
        live: "#4f9e63",
      },
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      maxWidth: { site: "1200px" },
    },
  },
  plugins: [],
};
