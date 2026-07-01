class WebSocketManager {
  constructor() {
    this.ws = null
    this.url = null
    this.listeners = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.heartbeatInterval = null
    this.isManualClose = false
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve(this.ws)
        return
      }

      this.url = url
      this.isManualClose = false

      try {
        this.ws = new WebSocket(url)

        this.ws.onopen = () => {
          console.log('[WS] 连接成功')
          this.reconnectAttempts = 0
          this.startHeartbeat()
          this.emit('open', {})
          resolve(this.ws)
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.emit(data.type || 'message', data)
          } catch (e) {
            this.emit('message', event.data)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WS] 连接错误', error)
          this.emit('error', error)
          reject(error)
        }

        this.ws.onclose = (event) => {
          console.log('[WS] 连接关闭', event.code, event.reason)
          this.stopHeartbeat()
          this.emit('close', event)

          if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            console.log(`[WS] 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
            setTimeout(() => this.connect(url), this.reconnectDelay * this.reconnectAttempts)
          }
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  disconnect() {
    this.isManualClose = true
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(type, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }))
    }
  }

  subscribe(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type).add(callback)
    return () => this.unsubscribe(type, callback)
  }

  unsubscribe(type, callback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(callback)
    }
  }

  emit(type, data) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach(cb => {
        try {
          cb(data)
        } catch (e) {
          console.error(`[WS] 事件处理器错误 (${type}):`, e)
        }
      })
    }
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      this.send('ping', { timestamp: Date.now() })
    }, 30000)
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }
}

export const wsManager = new WebSocketManager()
export default wsManager
