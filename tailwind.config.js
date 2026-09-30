const jiti = require('jiti')(__filename);
const { paleta } = jiti('./src/constantes/colores.ts');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: paleta,
    },
  },
  plugins: [],
};