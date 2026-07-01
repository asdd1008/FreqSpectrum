import { WebSocketServer } from 'ws'
import SpectrumDataGenerator from './dataGenerator.js'

const PORT = process.env.PORT || 8080

const wss = new WebSocketServer({
  port: PORT,
  path: '/ws'
})

const clients = new Map()

const spectrumGenerator = new SpectrumDataGenerator({
  centerFreq: 1000000000,
  span: 100000000,
  freqResolution: 1000000,
  refLevel: 0
})

let spectrumInterval = null
let levelInterval = null
let isRunning = true

const startSpectrumStream = () => {
  if (spectrumInterval) return
  
  spectrumInterval = setInterval(() => {
    const data = spectrumGenerator.generate()
    
    wss.clients.forEach(client => {
      if (client.readyState === 1 && client.subscriptions?.spectrum) {
        const clientConfig = client.config || {}
        const points = Math.floor((clientConfig.span || 100000000) / (clientConfig.freqResolution || 1000000))
        const sendData = data.slice(0, points)
        
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
    serverTime: Date.now()
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

console.log(`[Server] WebSocket服务器启动在 ws://localhost:${PORT}/ws`)
console.log(`[Server] 等待客户端连接...`)

process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭服务器...')
  if (spectrumInterval) clearInterval(spectrumInterval)
  if (levelInterval) clearInterval(levelInterval)
  wss.close(() => {
    console.log('[Server] 服务器已关闭')
    process.exit(0)
  })
})
