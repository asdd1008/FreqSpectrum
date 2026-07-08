import net from 'net'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false)
      } else {
        resolve(false)
      }
    })
    
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    
    server.listen(port, '127.0.0.1')
  })
}

export async function findAvailablePort(startPort, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    const available = await isPortAvailable(port)
    if (available) {
      return port
    }
  }
  throw new Error(`No available port found starting from ${startPort} after ${maxAttempts} attempts`)
}

export function savePortConfig(config) {
  const configPath = path.join(PROJECT_ROOT, 'port-config.json')
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    console.log(`[PortConfig] Saved to ${configPath}`)
  } catch (e) {
    console.warn('[PortConfig] Failed to save port config:', e.message)
  }
}

export function loadPortConfig() {
  const configPath = path.join(PROJECT_ROOT, 'port-config.json')
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.log('[PortConfig] No port config found, using defaults')
  }
  return null
}

export default {
  isPortAvailable,
  findAvailablePort,
  savePortConfig,
  loadPortConfig
}
