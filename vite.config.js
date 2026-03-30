import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Plugin que inyecta variables de entorno en firebase-messaging-sw.js
function injectEnvIntoSW() {
  return {
    name: 'inject-env-sw',
    closeBundle() {
      const swPath = path.resolve('dist/firebase-messaging-sw.js')
      if (!fs.existsSync(swPath)) return
      let content = fs.readFileSync(swPath, 'utf-8')
      const env = loadEnv('production', process.cwd(), 'VITE_')
      for (const [key, value] of Object.entries(env)) {
        content = content.replaceAll(`%${key}%`, value)
      }
      fs.writeFileSync(swPath, content)
    }
  }
}

export default defineConfig({
  plugins: [react(), injectEnvIntoSW()],
})
