/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        appbg: {
          50: "#F7FAFF",
          100: "#F0F5FF",
          200: "#E7EFFF"
        }
      },
      borderRadius: {
        xl: "18px",
        "2xl": "22px"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(17, 24, 39, 0.08)",
        card: "0 8px 24px rgba(17, 24, 39, 0.06)",
        float: "0 18px 40px rgba(17, 24, 39, 0.10)"
      }
    }
  },
  plugins: []
};
