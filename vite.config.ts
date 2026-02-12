import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Fix: Cast process to any because TS might complain about missing cwd() if node types are not picked up correctly
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // This allows your code (which uses process.env.API_KEY) to work during the build
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})