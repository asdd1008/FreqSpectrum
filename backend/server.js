import { WebSocketServer } from 'ws'
import http from 'http'
import url from 'url'
import zlib from 'zlib'
import SpectrumDataGenerator from './dataGenerator.js'
import { findAvailablePort, savePortConfig } from './utils/portUtils.js'

const DEFAULT_PORT = 8080

let wss = null
let httpServer = null
let actualPort = null

const clients = new Map()

// ==================== 历史数据存储（内存存储，生产环境应使用数据库） ====================

const historyStore = {
  sessions: new Map(),
  tiles: new Map(),
  zoomLogs: []
}

// 生成历史会话ID
function generateSessionId() {
  return 'hist-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
}

// 生成模拟历史数据
function generateMockHistoryData(freqStart, freqEnd, timeStart, timeEnd, points = 256) {
  const data = []
  const freqRange = freqEnd - freqStart
  const timeRange = timeEnd - timeStart

  for (let t = 0; t < points; t++) {
    const timeRatio = t / points
    const currentTime = timeStart + timeRange * timeRatio
    const frame = []

    for (let f = 0; f < points; f++) {
      const freqRatio = f / points
      const freq = freqStart + freqRange * freqRatio

      // 模拟频谱数据
      let value = -85 + (Math.random() - 0.5) * 10 // 噪声底

      // 添加一些信号
      if (Math.abs(freqRatio - 0.3) < 0.05) value = -40 + Math.sin(currentTime * 0.001) * 10
      if (Math.abs(freqRatio - 0.7) < 0.03) value = -30 + Math.cos(currentTime * 0.002) * 5

      frame.push(value)
    }

    data.push({
      timestamp: currentTime,
      spectrum: frame
    })
  }

  return data
}

// 生成图片瓦片
function generateTileImage(freqStart, freqEnd, timeStart, timeEnd, width = 256, height = 256) {
  // 使用 Canvas API 生成 PNG 图片
  // 注意：Node.js 环境没有原生 Canvas，我们使用纯数据生成
  const data = generateMockHistoryData(freqStart, freqEnd, timeStart, timeEnd, width)

  // 生成 RGBA 图像数据
  const imageData = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y++) {
    const frameIdx = Math.floor((y / height) * data.length)
    const frame = data[frameIdx]?.spectrum || []

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const value = frame[x] || -100

      // 将 dBm 值映射到 0-1
      const normalized = Math.max(0, Math.min(1, (value + 100) / 100))

      // 颜色映射 (蓝->绿->黄->红)
      let r, g, b
      if (normalized < 0.25) {
        const t = normalized / 0.25
        r = 0; g = 0; b = Math.floor(t * 255)
      } else if (normalized < 0.5) {
        const t = (normalized - 0.25) / 0.25
        r = 0; g = Math.floor(t * 255); b = 255
      } else if (normalized < 0.75) {
        const t = (normalized - 0.5) / 0.25
        r = Math.floor(t * 255); g = 255; b = Math.floor(255 * (1 - t))
      } else {
        const t = (normalized - 0.75) / 0.25
        r = 255; g = Math.floor(255 * (1 - t)); b = 0
      }

      imageData[idx] = r
      imageData[idx + 1] = g
      imageData[idx + 2] = b
      imageData[idx + 3] = 255
    }
  }

  return imageData
}

// 简单的 PNG 编码器（生成最小有效的PNG）
function createPNG(width, height, rgbaData) {
  // CRC32 表
  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crcTable[i] = c
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    }
    return c ^ 0xFFFFFFFF
  }

  function writeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii')
    const chunk = Buffer.concat([typeBuf, data])
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(data.length, 0)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(chunk) >>> 0, 0)
    return Buffer.concat([lenBuf, chunk, crcBuf])
  }

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // IDAT - 压缩图像数据
  const rowSize = width * 4 + 1
  const rawData = Buffer.alloc(rowSize * height)

  for (let y = 0; y < height; y++) {
    rawData[y * rowSize] = 0 // filter byte
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      const dstIdx = y * rowSize + 1 + x * 4
      rawData[dstIdx] = rgbaData[srcIdx]
      rawData[dstIdx + 1] = rgbaData[srcIdx + 1]
      rawData[dstIdx + 2] = rgbaData[srcIdx + 2]
      rawData[dstIdx + 3] = rgbaData[srcIdx + 3]
    }
  }

  // 使用 Node.js zlib 压缩
  const compressed = zlib.deflateSync(rawData)

  // 组装 PNG
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const ihdrChunk = writeChunk('IHDR', ihdr)
  const idatChunk = writeChunk('IDAT', compressed)
  const iendChunk = writeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

// ==================== HTTP API 路由 ====================

const handleHttpRequest = async (req, res) => {
  const parsedUrl = url.parse(req.url, true)
  const pathname = parsedUrl.pathname
  const method = req.method

  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // 健康检查
  if (pathname === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }))
    return
  }

  // 创建/查询历史会话
  if (pathname === '/api/history/session' && method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { timeStart, timeEnd, freqStart, freqEnd } = JSON.parse(body)
        const sessionId = generateSessionId()

        const session = {
          id: sessionId,
          timeStart,
          timeEnd,
          freqStart,
          freqEnd,
          createdAt: Date.now()
        }

        historyStore.sessions.set(sessionId, session)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          sessionId,
          timeStart,
          timeEnd,
          freqStart,
          freqEnd,
          message: 'Session created'
        }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // 获取图片瓦片
  if (pathname === '/api/history/tile' && method === 'GET') {
    const { level, x, y, freqStart, freqEnd, timeStart, timeEnd, sessionId } = parsedUrl.query

    try {
      const fStart = parseFloat(freqStart)
      const fEnd = parseFloat(freqEnd)
      const tStart = parseFloat(timeStart)
      const tEnd = parseFloat(timeEnd)

      // 生成瓦片缓存键
      const tileKey = `${sessionId}_${level}_${x}_${y}`

      let pngBuffer
      if (historyStore.tiles.has(tileKey)) {
        pngBuffer = historyStore.tiles.get(tileKey)
      } else {
        const rgbaData = generateTileImage(fStart, fEnd, tStart, tEnd)
        pngBuffer = await createPNG(256, 256, rgbaData)
        historyStore.tiles.set(tileKey, pngBuffer)
      }

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600'
      })
      res.end(pngBuffer)
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  // 接收缩放信息
  if (pathname === '/api/history/zoom' && method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const zoomInfo = JSON.parse(body)
        historyStore.zoomLogs.push({
          ...zoomInfo,
          serverTime: Date.now()
        })

        // 只保留最近100条日志
        if (historyStore.zoomLogs.length > 100) {
          historyStore.zoomLogs.shift()
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}

// ==================== WebSocket 部分（保持不变） ====================

const spectrumGenerator = new SpectrumDataGenerator({
  centerFreq: 1000000000,
  span: 100000000,
  freqResolution: 1000000,
  refLevel: 0
})

let spectrumInterval = null
let levelInterval = null

const startSpectrumStream = () => {
  if (spectrumInterval) return

  spectrumInterval = setInterval(() => {
    const data = spectrumGenerator.generate()

    wss.clients.forEach(client => {
      if (client.readyState === 1 && client.subscriptions?.spectrum) {
        const clientConfig = client.config || {}
        const points = Math.floor((clientConfig.span || 100000000) / (clientConfig.freqResolution || 1000000))
        const sendData = data.slice(0, Math.max(1, points))

        client.send(JSON.stringify({
          type: 'spectrumData',
          data: Array.from(sendData),
          timestamp: Date.now(),
          config: clientConfig
        }))
      }
    })
  }, 100)
}

const startLevelStream = () => {
  if (levelInterval) return

  levelInterval = setInterval(() => {
    wss.clients.forEach(client => {
      if (client.readyState === 1 && client.subscriptions?.level) {
        const level = spectrumGenerator.generateLevel()

        client.send(JSON.stringify({
          type: 'levelData',
          channel: client.config?.channel || 1,
          level,
          timestamp: Date.now()
        }))
      }
    })
  }, 100)
}

const handleMessage = (ws, data) => {
  const { type, ...payload } = data

  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now(),
        clientTime: payload.timestamp
      }))
      break

    case 'subscribe':
      handleSubscribe(ws, payload)
      break

    case 'unsubscribe':
      handleUnsubscribe(ws, payload)
      break

    case 'setConfig':
      handleSetConfig(ws, payload)
      break

    case 'getConfig':
      ws.send(JSON.stringify({
        type: 'config',
        config: ws.config
      }))
      break

    default:
      console.log(`[WS] 未知消息类型: ${type}`)
  }
}

const handleSubscribe = (ws, payload) => {
  const { channel } = payload

  if (channel === 'spectrum') {
    ws.subscriptions.spectrum = true
    console.log(`[WS] 客户端 ${ws.clientId} 订阅频谱数据`)
    startSpectrumStream()
  } else if (channel === 'level') {
    ws.subscriptions.level = true
    console.log(`[WS] 客户端 ${ws.clientId} 订阅电平数据`)
    startLevelStream()
  }

  ws.send(JSON.stringify({
    type: 'subscribed',
    channel,
    timestamp: Date.now()
  }))
}

const handleUnsubscribe = (ws, payload) => {
  const { channel } = payload

  if (channel === 'spectrum') {
    ws.subscriptions.spectrum = false
    console.log(`[WS] 客户端 ${ws.clientId} 取消订阅频谱数据`)
  } else if (channel === 'level') {
    ws.subscriptions.level = false
    console.log(`[WS] 客户端 ${ws.clientId} 取消订阅电平数据`)
  }

  ws.send(JSON.stringify({
    type: 'unsubscribed',
    channel,
    timestamp: Date.now()
  }))
}

const handleSetConfig = (ws, payload) => {
  ws.config = { ...ws.config, ...payload }

  if (payload.centerFreq || payload.span || payload.freqResolution) {
    spectrumGenerator.setConfig({
      centerFreq: ws.config.centerFreq || 1000000000,
      span: ws.config.span || 100000000,
      freqResolution: ws.config.freqResolution || 1000000,
      refLevel: ws.config.refLevel || 0,
      gain: ws.config.gain || 20
    })
  }

  ws.send(JSON.stringify({
    type: 'configUpdated',
    config: ws.config,
    timestamp: Date.now()
  }))
}

// ==================== 服务器启动 ====================

const startServer = async () => {
  try {
    actualPort = await findAvailablePort(DEFAULT_PORT)

    // 创建 HTTP 服务器
    httpServer = http.createServer(handleHttpRequest)

    // 创建 WebSocket 服务器，绑定到同一个 HTTP 服务器
    wss = new WebSocketServer({
      server: httpServer,
      path: '/ws'
    })

    savePortConfig({
      backendPort: actualPort,
      frontendPort: 5174,
      updatedAt: Date.now()
    })

    wss.on('connection', (ws, req) => {
      const clientId = Date.now() + Math.random()
      console.log(`[WS] 新客户端连接: ${clientId}`)

      ws.clientId = clientId
      ws.subscriptions = { spectrum: false, level: false }
      ws.config = {}

      clients.set(clientId, ws)

      ws.send(JSON.stringify({
        type: 'welcome',
        message: '连接成功',
        clientId,
        serverTime: Date.now(),
        port: actualPort
      }))

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString())
          handleMessage(ws, data)
        } catch (e) {
          console.error('[WS] 消息解析失败:', e.message)
        }
      })

      ws.on('close', () => {
        console.log(`[WS] 客户端断开: ${clientId}`)
        clients.delete(clientId)
      })

      ws.on('error', (error) => {
        console.error(`[WS] 客户端错误: ${clientId}`, error.message)
        clients.delete(clientId)
      })
    })

    // 启动 HTTP 服务器
    httpServer.listen(actualPort, () => {
      console.log(`[Server] HTTP服务器启动在 http://localhost:${actualPort}`)
      console.log(`[Server] WebSocket服务器启动在 ws://localhost:${actualPort}/ws`)
      console.log(`[Server] 等待客户端连接...`)
    })

  } catch (error) {
    console.error('[Server] 启动失败:', error.message)
    process.exit(1)
  }
}

process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭服务器...')
  if (spectrumInterval) clearInterval(spectrumInterval)
  if (levelInterval) clearInterval(levelInterval)
  if (wss) wss.close()
  if (httpServer) {
    httpServer.close(() => {
      console.log('[Server] 服务器已关闭')
      process.exit(0)
    })
  } else {
    process.exit(0)
  }
})

startServer()
