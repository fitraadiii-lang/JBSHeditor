/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'serif-journal': ['Georgia', 'serif'],
        'sans-journal': ['Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}