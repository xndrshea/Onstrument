/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#512da8',
          hover: '#673ab7'
        },
        dark: {
          DEFAULT: '#1a1b1f',
          lighter: '#232427'
        }
      }
    },
  },
  plugins: [],
}

