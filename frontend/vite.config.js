import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'

const DEFAULT_FRONTEND_PORT = 8500

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findAvailablePort(startPort, maxAttempts = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    const available = await isPortAvailable(port)
    if (available) return port
  }
  throw new Error(`No available port found starting from ${startPort}`)
}

function getBackendPort() {
  try {
    const configPath = path.resolve(
      fileURLToPath(import.meta.url),
      '../../port-config.json'
    )
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.backendPort) {
        return config.backendPort
      }
    }
  } catch (e) {
    console.log('[Vite] No port config found, using default backend port 8080')
  }
  return 8080
}

export default defineConfig(async () => {
  const frontendPort = await findAvailablePort(DEFAULT_FRONTEND_PORT)
  const backendPort = getBackendPort()
  
  console.log(`[Vite] Frontend port: ${frontendPort}`)
  console.log(`[Vite] Backend proxy port: ${backendPort}`)
  
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: frontendPort,
      strictPort: true,
      host: '0.0.0.0',
      proxy: {
        '/ws': {
          target: `ws://localhost:${backendPort}`,
          ws: true,
          changeOrigin: true
        },
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true
        }
      }
    }
  }
})
