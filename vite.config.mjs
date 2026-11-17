import { defineConfig } from 'vite'
import tailwind from '@tailwindcss/vite'
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : '/tea-collection/',
  plugins: [tailwind()],
}))