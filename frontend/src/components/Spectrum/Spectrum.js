import SpectrumWorker from './workers/SpectrumWorker.js?worker'
import SampleWorker from './workers/SampleWorker.js?worker'

const DEFAULT_CONFIG = {
  padding: { top: 30, right: 80, bottom: 30, left: 60 },
  waterfallHeight: 200,
  refLevel: 0,
  minLevel: -100,
  centerFreq: 1000000000,
  span: 100000000,
  showGrid: true,
  showLegend: true,
  waterfallVisible: true,
  zoomX: [0, 1],
  zoomY: [0, 1],
  maxHold: true,
  minHold: false,
  avgHold: false,
  markers: [],
  hoverInfo: {
    visible: true,
    fields: ['centerFreq', 'bandwidth', 'maxLevel']
  }
}

export class Spectrum {
  constructor(container, config = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : container
    
    if (!this.container) {
      throw new Error('Spectrum container not found')
    }
    
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.config.padding = { ...DEFAULT_CONFIG.padding, ...config.padding }
    
    this.canvases = {}
    this.contexts = {}
    this.layers = {}
    
    this.spectrumData = null
    this.maxHoldData = null
    this.minHoldData = null
    this.avgData = null
    this.waterfallData = []
    
    this.markers = []
    this.rectMarkers = []
    this.highlightedSignals = []
    this.rainMarkers = []
    this.boxSelection = null
    this.fallsSelection = null
    this.playLineIndex = -1
    this.isPaused = false
    this.isPlayingBack = false
    this.playbackData = null
    this.playbackIndex = 0
    
    this.mouse = {
      x: 0,
      y: 0,
      isDown: false,
      button: -1,
      downX: 0,
      downY: 0,
      dragStartX: 0,
      dragStartY: 0,
      isDragging: false,
      isRightDragging: false,
      lastClickTime: 0,
      lastClickX: 0,
      lastClickY: 0
    }
    
    this.callbacks = {}
    this.imageBitmapCache = null
    this.dataCache = null
    
    this._resizeObserver = null
    this._isReady = false
    
    this.initLayout()
    this.initWorkers()
    this.initEvents()
    this.initGL()
    
    if (this.width <= 0 || this.height <= 0) {
      this._waitForSize()
    } else {
      this._isReady = true
    }
  }
  
  _waitForSize() {
    const checkSize = () => {
      const w = this.container.clientWidth
      const h = this.container.clientHeight
      if (w > 0 && h > 0) {
        this.resize()
        this._isReady = true
        this._emit('ready')
      } else {
        requestAnimationFrame(checkSize)
      }
    }
    requestAnimationFrame(checkSize)
  }
  
  initLayout() {
    const { padding, waterfallHeight, waterfallVisible } = this.config
    
    this.width = this.container.clientWidth
    this.height = this.container.clientHeight
    
    const plotHeight = waterfallVisible
      ? this.height - padding.top - padding.bottom - waterfallHeight - 25
      : this.height - padding.top - padding.bottom
    
    this.plotArea = {
      x: padding.left,
      y: padding.top,
      width: this.width - padding.left - padding.right,
      height: plotHeight
    }
    
    this.waterfallArea = {
      x: padding.left,
      y: padding.top + plotHeight + 25,
      width: this.width - padding.left - padding.right,
      height: waterfallVisible ? waterfallHeight : 0
    }
    
    this.container.innerHTML = ''
    this.container.style.position = 'relative'
    this.container.style.overflow = 'hidden'
    
    const freqDiv = document.createElement('div')
    freqDiv.className = 'freq-div'
    freqDiv.style.cssText = `
      position: absolute;
      left: 0; top: 0;
      width: 100%;
      height: ${this.waterfallArea.y}px;
    `
    
    const rainDiv = document.createElement('div')
    rainDiv.className = 'rain-div'
    rainDiv.style.cssText = `
      position: absolute;
      left: 0; top: ${this.waterfallArea.y}px;
      width: 100%;
      height: ${this.waterfallArea.height}px;
    `
    
    const dpr = window.devicePixelRatio || 1
    this.dpr = dpr
    
    this.layers.freq = {
      baseLayer: this._createCanvas('base-layer', freqDiv, this.width, this.waterfallArea.y, dpr),
      lineLayer: this._createCanvas('line-layer', freqDiv, this.width, this.waterfallArea.y, dpr),
      activeLayer: this._createCanvas('active-layer', freqDiv, this.width, this.waterfallArea.y, dpr)
    }
    
    this.layers.rain = {
      rainCanvas: this._createCanvas('rain-canvas', rainDiv, this.width, this.waterfallArea.height, dpr),
      rainHandCanvas: this._createCanvas('rain-hand-canvas', rainDiv, this.width, this.waterfallArea.height, dpr),
      legendCanvas: this._createCanvas('legend-canvas', rainDiv, this.width, this.waterfallArea.height, dpr)
    }
    
    const lineCtx = this.layers.freq.lineLayer.getContext('webgl') || 
                    this.layers.freq.lineLayer.getContext('experimental-webgl') ||
                    this.layers.freq.lineLayer.getContext('2d')
    
    this.contexts = {
      base: this.layers.freq.baseLayer.getContext('2d'),
      line: lineCtx,
      active: this.layers.freq.activeLayer.getContext('2d'),
      rain: this.layers.rain.rainCanvas.getContext('2d'),
      rainHand: this.layers.rain.rainHandCanvas.getContext('2d'),
      legend: this.layers.rain.legendCanvas.getContext('2d')
    }
    
    this.container.appendChild(freqDiv)
    this.container.appendChild(rainDiv)
    
    this.freqDiv = freqDiv
    this.rainDiv = rainDiv
    
    this._plotOffsetY = 0
  }
  
  _createCanvas(className, parent, w, h, dpr) {
    const canvas = document.createElement('canvas')
    canvas.className = className
    canvas.style.cssText = `
      position: absolute;
      left: 0; top: 0;
      width: ${w}px;
      height: ${h}px;
    `
    canvas.width = w * dpr
    canvas.height = h * dpr
    parent.appendChild(canvas)
    return canvas
  }
  
  initGL() {
    const ctx = this.contexts.line
    if (!ctx) {
      this._useCanvasFallback = true
      return
    }
    
    const isWebGL = typeof ctx.viewport === 'function' && typeof ctx.createShader === 'function'
    
    if (!isWebGL) {
      this._useCanvasFallback = true
      this.gl = null
      return
    }
    
    this.gl = ctx
    this._useCanvasFallback = false
    const dpr = this.dpr
    this.gl.viewport(0, 0, this.width * dpr, this.waterfallArea.y * dpr)
    
    const vsSource = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      uniform float u_minLevel;
      uniform float u_maxLevel;
      uniform float u_plotX;
      uniform float u_plotY;
      uniform float u_plotWidth;
      uniform float u_plotHeight;
      varying float v_level;
      
      void main() {
        float level = a_position.y;
        float normalizedY = (level - u_minLevel) / (u_maxLevel - u_minLevel);
        normalizedY = clamp(normalizedY, 0.0, 1.0);
        
        float x = u_plotX + a_position.x * u_plotWidth;
        float y = u_plotY + u_plotHeight * (1.0 - normalizedY);
        
        vec2 clipSpace = vec2(
          (x / u_resolution.x) * 2.0 - 1.0,
          (y / u_resolution.y) * -2.0 + 1.0
        );
        
        gl_Position = vec4(clipSpace, 0.0, 1.0);
        v_level = level;
      }
    `
    
    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;
      varying float v_level;
      
      void main() {
        gl_FragColor = u_color;
      }
    `
    
    this.spectrumProgram = this._createProgram(gl, vsSource, fsSource)
    
    const gridVs = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      void main() {
        vec2 clipSpace = vec2(
          (a_position.x / u_resolution.x) * 2.0 - 1.0,
          (a_position.y / u_resolution.y) * -2.0 + 1.0
        );
        gl_Position = vec4(clipSpace, 0.0, 1.0);
      }
    `
    
    const gridFs = `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `
    
    this.gridProgram = this._createProgram(gl, gridVs, gridFs)
  }
  
  _createProgram(gl, vsSource, fsSource) {
    const vs = this._createShader(gl, gl.VERTEX_SHADER, vsSource)
    const fs = this._createShader(gl, gl.FRAGMENT_SHADER, fsSource)
    
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return null
    }
    
    return program
  }
  
  _createShader(gl, type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }
    
    return shader
  }
  
  initWorkers() {
    this.spectrumWorker = new SpectrumWorker()
    this.sampleWorker = new SampleWorker()
    
    this.spectrumWorker.onmessage = (e) => {
      const { type, data } = e.data
      if (type === 'holdLines') {
        this.maxHoldData = data.maxHold
        this.minHoldData = data.minHold
        this.avgData = data.avg
        this._drawHoldLines()
      }
    }
    
    this.sampleWorker.onmessage = (e) => {
      const { type, data } = e.data
      if (type === 'sampled') {
        this._drawSpectrumLine(data.sampled)
      }
    }
  }
  
  initEvents() {
    const activeCanvas = this.layers.freq.activeLayer
    const rainCanvas = this.layers.rain.rainHandCanvas
    
    activeCanvas.addEventListener('mousemove', this._handleMouseMove.bind(this))
    activeCanvas.addEventListener('mousedown', this._handleMouseDown.bind(this))
    activeCanvas.addEventListener('mouseup', this._handleMouseUp.bind(this))
    activeCanvas.addEventListener('mouseleave', this._handleMouseLeave.bind(this))
    activeCanvas.addEventListener('wheel', this._handleWheel.bind(this))
    activeCanvas.addEventListener('contextmenu', (e) => e.preventDefault())
    
    rainCanvas.addEventListener('mousemove', this._handleRainMouseMove.bind(this))
    rainCanvas.addEventListener('mousedown', this._handleRainMouseDown.bind(this))
    rainCanvas.addEventListener('mouseup', this._handleRainMouseUp.bind(this))
    rainCanvas.addEventListener('mouseleave', this._handleRainMouseLeave.bind(this))
    rainCanvas.addEventListener('contextmenu', (e) => e.preventDefault())
    
    window.addEventListener('resize', this._handleResize.bind(this))
    
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect
          if (width > 0 && height > 0 && (this.width !== width || this.height !== height)) {
            this._handleResize()
            if (!this._isReady && this.width > 0) {
              this._isReady = true
              this._emit('ready')
            }
          }
        }
      })
      this._resizeObserver.observe(this.container)
    }
  }
  
  _handleMouseMove(e) {
    const rect = this.layers.freq.activeLayer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    this.mouse.x = x
    this.mouse.y = y
    
    if (this.mouse.isDown && this.mouse.button === 0 && !this.mouse.isDragging) {
      const dx = Math.abs(x - this.mouse.downX)
      const dy = Math.abs(y - this.mouse.downY)
      if (dx > 5 || dy > 5) {
        this.mouse.isDragging = true
        this.mouse.dragStartX = this.mouse.downX
        this.mouse.dragStartY = this.mouse.downY
      }
    }
    
    if (this.mouse.isDragging && this.mouse.button === 0) {
      this._handlePan(x, y)
    }
    
    this._drawActiveLayer()
    
    const inPlotArea = x >= this.plotArea.x && x <= this.plotArea.x + this.plotArea.width &&
                       y >= this.plotArea.y && y <= this.plotArea.y + this.plotArea.height
    
    if (inPlotArea && this.spectrumData && this.spectrumData.length > 0) {
      const hoverData = this._getHoverData(x, y)
      this._emit('hover', { x, y, ...hoverData })
    } else {
      this._emit('hover', { x, y, freq: this.getFreqForX(x), level: this.getLevelForY(y) })
    }
  }
  
  _handleMouseDown(e) {
    const rect = this.layers.freq.activeLayer.getBoundingClientRect()
    this.mouse.isDown = true
    this.mouse.button = e.button
    this.mouse.downX = e.clientX - rect.left
    this.mouse.downY = e.clientY - rect.top
    this.mouse.isDragging = false
    this.mouse.isRightDragging = false
  }
  
  _handleMouseUp(e) {
    const rect = this.layers.freq.activeLayer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const now = Date.now()
    
    if (!this.mouse.isDragging && e.button === 0) {
      if (now - this.mouse.lastClickTime < 300 &&
          Math.abs(x - this.mouse.lastClickX) < 5 &&
          Math.abs(y - this.mouse.lastClickY) < 5) {
        this._handleDoubleClick(x, y)
      } else {
        this.mouse.lastClickTime = now
        this.mouse.lastClickX = x
        this.mouse.lastClickY = y
        this._handleClick(x, y)
      }
    }
    
    this.mouse.isDown = false
    this.mouse.button = -1
    this.mouse.isDragging = false
    
    this._drawActiveLayer()
  }
  
  _handleMouseLeave() {
    this.mouse.isDown = false
    this.mouse.isDragging = false
    this.mouse.isRightDragging = false
    this._drawActiveLayer()
    this._emit('hoverEnd')
  }
  
  _handleWheel(e) {
    e.preventDefault()
    
    const rect = this.layers.freq.activeLayer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const delta = e.deltaY > 0 ? 1.1 : 0.9
    
    if (e.shiftKey) {
      this._zoomY(y, delta)
    } else {
      this._zoomX(x, delta)
    }
    
    this._emit('zoom', { zoomX: this.config.zoomX, zoomY: this.config.zoomY })
    this.render()
  }
  
  _zoomX(anchorX, factor) {
    const [z0, z1] = this.config.zoomX
    const range = z1 - z0
    
    const anchorRatio = (anchorX - this.plotArea.x) / this.plotArea.width
    const anchorInData = z0 + anchorRatio * range
    
    const newRange = range * factor
    const newZ0 = anchorInData - anchorRatio * newRange
    const newZ1 = anchorInData + (1 - anchorRatio) * newRange
    
    this.config.zoomX = [
      Math.max(0, Math.min(1, newZ0)),
      Math.max(0, Math.min(1, newZ1))
    ]
    
    if (this.config.zoomX[1] - this.config.zoomX[0] < 0.001) {
      this.config.zoomX = [z0, z1]
    }
  }
  
  _zoomY(anchorY, factor) {
    const [z0, z1] = this.config.zoomY
    const range = z1 - z0
    
    const anchorRatio = (anchorY - this.plotArea.y) / this.plotArea.height
    const anchorInData = z0 + anchorRatio * range
    
    const newRange = range * factor
    const newZ0 = anchorInData - anchorRatio * newRange
    const newZ1 = anchorInData + (1 - anchorRatio) * newRange
    
    this.config.zoomY = [
      Math.max(0, Math.min(1, newZ0)),
      Math.max(0, Math.min(1, newZ1))
    ]
    
    if (this.config.zoomY[1] - this.config.zoomY[0] < 0.001) {
      this.config.zoomY = [z0, z1]
    }
  }
  
  _handlePan(x, y) {
    const dx = x - this.mouse.dragStartX
    const dy = y - this.mouse.dragStartY
    
    const [zx0, zx1] = this.config.zoomX
    const rangeX = zx1 - zx0
    const panX = (dx / this.plotArea.width) * rangeX
    
    let newZx0 = zx0 - panX
    let newZx1 = zx1 - panX
    
    if (newZx0 < 0) {
      newZx1 -= newZx0
      newZx0 = 0
    }
    if (newZx1 > 1) {
      newZx0 -= (newZx1 - 1)
      newZx1 = 1
    }
    
    this.config.zoomX = [newZx0, newZx1]
    
    const [zy0, zy1] = this.config.zoomY
    const rangeY = zy1 - zy0
    const panY = (dy / this.plotArea.height) * rangeY
    
    let newZy0 = zy0 - panY
    let newZy1 = zy1 - panY
    
    if (newZy0 < 0) {
      newZy1 -= newZy0
      newZy0 = 0
    }
    if (newZy1 > 1) {
      newZy0 -= (newZy1 - 1)
      newZy1 = 1
    }
    
    this.config.zoomY = [newZy0, newZy1]
    
    this.mouse.dragStartX = x
    this.mouse.dragStartY = y
    
    this.render()
  }
  
  _handleClick(x, y) {
    this._emit('click', { x, y, freq: this.getFreqForX(x), level: this.getLevelForY(y) })
  }
  
  _handleDoubleClick(x, y) {
    const clickedMarker = this.markers.find(m => {
      const mx = this.getXForFreq(m.freq)
      const level = m.level !== undefined ? m.level : this._getDataLevelAtFreq(m.freq)
      const my = this.getYForLevel(level)
      
      const halfWidth = (m.width || 50) / 2
      const halfHeight = (m.height || 30) / 2
      
      const startX = mx - halfWidth
      const endX = mx + halfWidth
      const startY = my - halfHeight
      const endY = my + halfHeight
      
      return x >= startX && x <= endX && y >= startY && y <= endY
    })
    
    if (clickedMarker) {
      this._emit('doubleClickMarker', { marker: clickedMarker, markerId: clickedMarker.id, x, y })
    } else {
      this._emit('doubleClick', { x, y, freq: this.getFreqForX(x), level: this.getLevelForY(y) })
    }
  }
  
  _handleRainMouseMove(e) {
    const rect = this.layers.rain.rainHandCanvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    if (this.mouse.isDown && this.mouse.button === 2) {
      this.mouse.isRightDragging = true
      this.fallsSelection = {
        startX: this.mouse.downX,
        startY: this.mouse.downY,
        endX: x,
        endY: y
      }
      this._drawRainHand()
    }
  }
  
  _handleRainMouseDown(e) {
    const rect = this.layers.rain.rainHandCanvas.getBoundingClientRect()
    this.mouse.isDown = true
    this.mouse.button = e.button
    this.mouse.downX = e.clientX - rect.left
    this.mouse.downY = e.clientY - rect.top
    this.mouse.isRightDragging = false
  }
  
  _handleRainMouseUp(e) {
    const rect = this.layers.rain.rainHandCanvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    if (this.mouse.isRightDragging && e.button === 2) {
      const result = this._countBoxSelect()
      if (result) {
        this._emit('fallsSelectComplate', result)
      }
    }
    
    this.mouse.isDown = false
    this.mouse.button = -1
    this.mouse.isRightDragging = false
    
    this._drawRainHand()
  }
  
  _handleRainMouseLeave() {
    this.mouse.isDown = false
    this.mouse.isRightDragging = false
    this._drawRainHand()
  }
  
  _handleResize() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    this._resizeTimer = setTimeout(() => {
      this.resize()
    }, 100)
  }
  
  resize() {
    this.initLayout()
    this.initGL()
    this.render()
    this._emit('resize', { width: this.width, height: this.height })
  }
  
  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = []
    }
    this.callbacks[event].push(callback)
  }
  
  off(event, callback) {
    if (!this.callbacks[event]) return
    this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback)
  }
  
  _emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data))
    }
  }
  
  addData(data) {
    if (this.isPaused && !this.isPlayingBack) return
    
    const floatData = data instanceof Float32Array ? data : new Float32Array(data)
    this.spectrumData = floatData
    
    if (this.config.waterfallVisible && !this.isPlayingBack) {
      this.waterfallData.unshift([...floatData])
      if (this.waterfallData.length > 500) {
        this.waterfallData.pop()
      }
    }
    
    if (this.config.maxHold || this.config.minHold || this.config.avgHold) {
      this.spectrumWorker.postMessage({
        type: 'updateHold',
        data: {
          spectrum: floatData,
          maxHold: this.config.maxHold,
          minHold: this.config.minHold,
          avgHold: this.config.avgHold
        }
      })
    }
    
    this._updateAxis()
    this._drawSpectrum()
    
    if (this.config.waterfallVisible) {
      this._drawWaterfall()
    }
    
    this._drawActiveLayer()
  }
  
  beginDraw(frameData) {
    const floatData = frameData instanceof Float32Array ? frameData : new Float32Array(frameData)
    this.spectrumData = floatData
    this._updateAxis()
    this._drawSpectrum()
    this._drawActiveLayer()
  }
  
  updateAxis(config) {
    if (config) {
      Object.assign(this.config, config)
    }
    this._updateAxis()
    this.render()
  }
  
  _updateAxis() {
    this._drawBaseLayer()
    this._drawLegend()
    this._drawRainLegend()
  }
  
  _drawBaseLayer() {
    const ctx = this.contexts.base
    const { plotArea } = this
    
    ctx.clearRect(0, 0, this.width * this.dpr, this.waterfallArea.y * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.2)'
    ctx.lineWidth = 1
    
    const gridCountX = 10
    const gridCountY = 10
    
    for (let i = 0; i <= gridCountX; i++) {
      const x = plotArea.x + (plotArea.width / gridCountX) * i
      ctx.beginPath()
      ctx.moveTo(x, plotArea.y)
      ctx.lineTo(x, plotArea.y + plotArea.height)
      ctx.stroke()
    }
    
    for (let i = 0; i <= gridCountY; i++) {
      const y = plotArea.y + (plotArea.height / gridCountY) * i
      ctx.beginPath()
      ctx.moveTo(plotArea.x, y)
      ctx.lineTo(plotArea.x + plotArea.width, y)
      ctx.stroke()
    }
    
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.5)'
    ctx.strokeRect(plotArea.x, plotArea.y, plotArea.width, plotArea.height)
    
    ctx.fillStyle = '#8ab4d8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    
    for (let i = 0; i <= gridCountY; i++) {
      const y = plotArea.y + (plotArea.height / gridCountY) * i
      const level = this.getLevelForY(y)
      ctx.fillText(`${level.toFixed(0)} dBm`, plotArea.x - 5, y)
    }
    
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    
    for (let i = 0; i <= gridCountX; i++) {
      const x = plotArea.x + (plotArea.width / gridCountX) * i
      const freq = this.getFreqForX(x)
      ctx.fillText(this._formatFreq(freq), x, plotArea.y + plotArea.height + 5)
    }
    
    ctx.restore()
  }
  
  _drawSpectrum() {
    if (!this.spectrumData || this.spectrumData.length === 0) return
    
    const targetWidth = Math.floor(this.plotArea.width)
    const spectrumData = this.spectrumData instanceof Float32Array 
      ? this.spectrumData 
      : new Float32Array(this.spectrumData)
    
    const zoomX = Array.isArray(this.config.zoomX) ? [...this.config.zoomX] : [0, 1]
    this.sampleWorker.postMessage({
      type: 'sample',
      data: {
        spectrum: spectrumData,
        targetWidth,
        zoomX
      }
    })
  }
  
  _drawSpectrumLine(sampledData) {
    const gl = this.gl
    
    if (!gl || this._useCanvasFallback) {
      this._drawSpectrumCanvas(sampledData)
      return
    }
    
    const { plotArea, config } = this
    const { zoomY } = config
    
    const minLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[1]
    const maxLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[0]
    
    gl.clearColor(0.0, 0.0, 0.0, 0.0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    
    const program = this.spectrumProgram
    gl.useProgram(program)
    
    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const minLevelLocation = gl.getUniformLocation(program, 'u_minLevel')
    const maxLevelLocation = gl.getUniformLocation(program, 'u_maxLevel')
    const plotXLocation = gl.getUniformLocation(program, 'u_plotX')
    const plotYLocation = gl.getUniformLocation(program, 'u_plotY')
    const plotWidthLocation = gl.getUniformLocation(program, 'u_plotWidth')
    const plotHeightLocation = gl.getUniformLocation(program, 'u_plotHeight')
    const colorLocation = gl.getUniformLocation(program, 'u_color')
    
    gl.uniform2f(resolutionLocation, this.width, this.waterfallArea.y)
    gl.uniform1f(minLevelLocation, minLevel)
    gl.uniform1f(maxLevelLocation, maxLevel)
    gl.uniform1f(plotXLocation, plotArea.x)
    gl.uniform1f(plotYLocation, plotArea.y)
    gl.uniform1f(plotWidthLocation, plotArea.width)
    gl.uniform1f(plotHeightLocation, plotArea.height)
    
    const points = sampledData.length
    const vertices = new Float32Array(points * 2)
    
    for (let i = 0; i < points; i++) {
      vertices[i * 2] = i / Math.max(1, points - 1)
      vertices[i * 2 + 1] = sampledData[i]
    }
    
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)
    
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
    
    gl.uniform4f(colorLocation, 0.0, 1.0, 0.4, 1.0)
    gl.drawArrays(gl.LINE_STRIP, 0, points)
    
    gl.deleteBuffer(buffer)
  }
  
  _drawSpectrumCanvas(sampledData) {
    const ctx = this.contexts.line
    const { plotArea, config } = this
    const { zoomY } = config
    
    const minLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[1]
    const maxLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[0]
    
    ctx.clearRect(0, 0, this.width * this.dpr, this.waterfallArea.y * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    ctx.strokeStyle = '#00ff66'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    
    const points = sampledData.length
    for (let i = 0; i < points; i++) {
      const x = plotArea.x + (i / Math.max(1, points - 1)) * plotArea.width
      const value = sampledData[i]
      const ratio = (maxLevel - value) / (maxLevel - minLevel)
      const y = plotArea.y + ratio * plotArea.height
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    
    ctx.stroke()
    ctx.restore()
  }
  
  _drawHoldLines() {
    if (!this.gl || this._useCanvasFallback) {
      this._drawHoldLinesCanvas()
      return
    }
    
    const gl = this.gl
    const { plotArea, config } = this
    const { zoomY } = config
    
    const minLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[1]
    const maxLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[0]
    
    const program = this.spectrumProgram
    gl.useProgram(program)
    
    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const minLevelLocation = gl.getUniformLocation(program, 'u_minLevel')
    const maxLevelLocation = gl.getUniformLocation(program, 'u_maxLevel')
    const plotXLocation = gl.getUniformLocation(program, 'u_plotX')
    const plotYLocation = gl.getUniformLocation(program, 'u_plotY')
    const plotWidthLocation = gl.getUniformLocation(program, 'u_plotWidth')
    const plotHeightLocation = gl.getUniformLocation(program, 'u_plotHeight')
    const colorLocation = gl.getUniformLocation(program, 'u_color')
    
    gl.uniform2f(resolutionLocation, this.width, this.waterfallArea.y)
    gl.uniform1f(minLevelLocation, minLevel)
    gl.uniform1f(maxLevelLocation, maxLevel)
    gl.uniform1f(plotXLocation, plotArea.x)
    gl.uniform1f(plotYLocation, plotArea.y)
    gl.uniform1f(plotWidthLocation, plotArea.width)
    gl.uniform1f(plotHeightLocation, plotArea.height)
    
    const drawLine = (data, color) => {
      if (!data || data.length === 0) return
      
      const targetWidth = Math.floor(plotArea.width)
      const sampled = this._quickSample(data, targetWidth)
      const points = sampled.length
      const vertices = new Float32Array(points * 2)
      
      for (let i = 0; i < points; i++) {
        vertices[i * 2] = i / Math.max(1, points - 1)
        vertices[i * 2 + 1] = sampled[i]
      }
      
      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)
      
      gl.enableVertexAttribArray(positionLocation)
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
      
      gl.uniform4f(colorLocation, color[0], color[1], color[2], color[3])
      gl.drawArrays(gl.LINE_STRIP, 0, points)
      
      gl.deleteBuffer(buffer)
    }
    
    if (this.maxHoldData) {
      drawLine(this.maxHoldData, [1.0, 0.3, 0.3, 1.0])
    }
    
    if (this.minHoldData) {
      drawLine(this.minHoldData, [0.3, 0.8, 1.0, 1.0])
    }
    
    if (this.avgData) {
      drawLine(this.avgData, [1.0, 1.0, 0.3, 1.0])
    }
  }
  
  _quickSample(data, targetWidth) {
    if (!targetWidth || targetWidth <= 0) return data
    if (data.length <= targetWidth) return data
    
    const result = new Float32Array(targetWidth)
    const step = data.length / targetWidth
    
    for (let i = 0; i < targetWidth; i++) {
      const start = Math.floor(i * step)
      const end = Math.floor((i + 1) * step)
      let max = -Infinity
      for (let j = start; j < end && j < data.length; j++) {
        if (data[j] > max) max = data[j]
      }
      result[i] = max
    }
    
    return result
  }

  _drawHoldLinesCanvas() {
    const ctx = this.contexts.line
    const { plotArea, config } = this
    const { zoomY } = config
    
    const minLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[1]
    const maxLevel = config.refLevel - (config.refLevel - config.minLevel) * zoomY[0]
    
    const drawLine = (data, color) => {
      if (!data || data.length === 0) return
      
      const targetWidth = Math.floor(plotArea.width)
      const sampled = this._quickSample(data, targetWidth)
      const points = sampled.length
      
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      
      for (let i = 0; i < points; i++) {
        const x = plotArea.x + (i / Math.max(1, points - 1)) * plotArea.width
        const value = sampled[i]
        const ratio = (maxLevel - value) / (maxLevel - minLevel)
        const y = plotArea.y + ratio * plotArea.height
        
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      
      ctx.stroke()
    }
    
    if (this.maxHoldData) {
      drawLine(this.maxHoldData, '#ff4d4d')
    }
    
    if (this.minHoldData) {
      drawLine(this.minHoldData, '#4dd2ff')
    }
    
    if (this.avgData) {
      drawLine(this.avgData, '#ffff4d')
    }
  }
  
  async _drawWaterfall() {
    const ctx = this.contexts.rain
    const { waterfallArea } = this
    const w = Math.floor(waterfallArea.width * this.dpr)
    const h = Math.floor(waterfallArea.height * this.dpr)
    
    if (this.imageBitmapCache) {
      this.imageBitmapCache.close()
      this.imageBitmapCache = null
    }
    
    const imageData = ctx.createImageData(w, h)
    const data = imageData.data
    
    const lines = this.waterfallData.length
    const lineHeight = h / Math.max(1, lines)
    
    for (let py = 0; py < h; py++) {
      const lineIndex = Math.min(lines - 1, Math.floor(py / lineHeight))
      const lineData = this.waterfallData[lineIndex]
      
      if (!lineData) continue
      
      for (let px = 0; px < w; px++) {
        const ratio = px / w
        const zoomedX = this.config.zoomX[0] + ratio * (this.config.zoomX[1] - this.config.zoomX[0])
        const pointIndex = Math.min(lineData.length - 1, Math.floor(zoomedX * lineData.length))
        const value = lineData[pointIndex]
        
        const color = this._getWaterfallColor(value)
        const idx = (py * w + px) * 4
        
        data[idx] = color.r
        data[idx + 1] = color.g
        data[idx + 2] = color.b
        data[idx + 3] = 255
      }
    }
    
    ctx.clearRect(0, 0, w, h)
    ctx.putImageData(imageData, 0, 0)
  }
  
  _getWaterfallColor(value) {
    const minL = this.config.minLevel
    const maxL = this.config.refLevel
    const ratio = Math.max(0, Math.min(1, (value - minL) / (maxL - minL)))
    
    let r, g, b
    
    if (ratio < 0.25) {
      const t = ratio / 0.25
      r = 0
      g = Math.floor(0 + t * 50)
      b = Math.floor(50 + t * 150)
    } else if (ratio < 0.5) {
      const t = (ratio - 0.25) / 0.25
      r = Math.floor(0 + t * 200)
      g = Math.floor(50 + t * 150)
      b = Math.floor(200 - t * 150)
    } else if (ratio < 0.75) {
      const t = (ratio - 0.5) / 0.25
      r = 255
      g = Math.floor(200 + t * 55)
      b = Math.floor(50 - t * 50)
    } else {
      const t = (ratio - 0.75) / 0.25
      r = 255
      g = Math.floor(255 - t * 150)
      b = 0
    }
    
    return { r, g, b }
  }
  
  _drawLegend() {
    const ctx = this.contexts.base
    const { plotArea } = this
    
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    const legends = []
    legends.push({ color: '#00ff66', label: '实时频谱' })
    if (this.config.maxHold) legends.push({ color: '#ff4d4d', label: '最大保持' })
    if (this.config.minHold) legends.push({ color: '#4dd2ff', label: '最小保持' })
    if (this.config.avgHold) legends.push({ color: '#ffff4d', label: '平均' })
    
    let x = plotArea.x + 10
    const y = plotArea.y + 10
    
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    
    legends.forEach((legend, i) => {
      const offsetX = i * 100
      
      ctx.fillStyle = legend.color
      ctx.fillRect(x + offsetX, y, 14, 14)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + offsetX, y, 14, 14)
      
      ctx.fillStyle = '#cce0ff'
      ctx.fillText(legend.label, x + offsetX + 20, y + 2)
    })
    
    ctx.restore()
  }
  
  _drawRainLegend() {
    const ctx = this.contexts.legend
    const { waterfallArea } = this
    
    ctx.clearRect(0, 0, this.width * this.dpr, waterfallArea.height * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    const barWidth = 14
    const barHeight = waterfallArea.height
    const barX = waterfallArea.x + waterfallArea.width + 10
    const barY = 0
    
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(barX, barY, barWidth, barHeight)
    
    for (let i = 0; i < barHeight; i++) {
      const ratio = 1 - i / barHeight
      const value = this.config.refLevel - (this.config.refLevel - this.config.minLevel) * ratio
      const color = this._getWaterfallColor(value)
      
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      ctx.fillRect(barX + 1, barY + i, barWidth - 2, 1)
    }
    
    ctx.fillStyle = '#cce0ff'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    
    ctx.fillText(`${this.config.refLevel} dBm`, barX + barWidth + 5, barY + 6)
    
    const midLevel = (this.config.refLevel + this.config.minLevel) / 2
    ctx.fillText(`${midLevel.toFixed(0)} dBm`, barX + barWidth + 5, barY + barHeight / 2)
    
    ctx.fillText(`${this.config.minLevel} dBm`, barX + barWidth + 5, barY + barHeight - 6)
    
    ctx.fillStyle = '#cce0ff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    
    ctx.save()
    ctx.translate(waterfallArea.x - 15, waterfallArea.height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('时间', 0, 0)
    ctx.restore()
    
    const gridCountX = 10
    ctx.font = '10px monospace'
    ctx.textBaseline = 'bottom'
    
    for (let i = 0; i <= gridCountX; i++) {
      const x = waterfallArea.x + (waterfallArea.width / gridCountX) * i
      const freq = this.getFreqForX(x)
      ctx.fillText(this._formatFreq(freq), x, waterfallArea.height - 2)
    }
    
    ctx.restore()
  }
  
  _drawActiveLayer() {
    const ctx = this.contexts.active
    const { plotArea } = this
    
    ctx.clearRect(0, 0, this.width * this.dpr, this.waterfallArea.y * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    this._drawHighlightedSignals(ctx)
    this._drawRectMarkers(ctx)
    
    this.markers.forEach(marker => {
      const x = this.getXForFreq(marker.freq)
      if (x < plotArea.x || x > plotArea.x + plotArea.width) return
      
      const level = marker.level !== undefined ? marker.level : this._getDataLevelAtFreq(marker.freq)
      const y = this.getYForLevel(level)
      
      ctx.strokeStyle = marker.color || '#ffeb3b'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      
      ctx.beginPath()
      ctx.moveTo(x, plotArea.y)
      ctx.lineTo(x, plotArea.y + plotArea.height)
      ctx.stroke()
      
      ctx.setLineDash([])
      
      ctx.fillStyle = marker.color || '#ffeb3b'
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.fillStyle = '#000'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('M' + (marker.id || ''), x, y)
    })
    
    if (this.mouse.x >= plotArea.x && 
        this.mouse.x <= plotArea.x + plotArea.width &&
        this.mouse.y >= plotArea.y && 
        this.mouse.y <= plotArea.y + plotArea.height) {
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      
      ctx.beginPath()
      ctx.moveTo(this.mouse.x, plotArea.y)
      ctx.lineTo(this.mouse.x, plotArea.y + plotArea.height)
      ctx.stroke()
      
      ctx.beginPath()
      ctx.moveTo(plotArea.x, this.mouse.y)
      ctx.lineTo(plotArea.x + plotArea.width, this.mouse.y)
      ctx.stroke()
      
      ctx.setLineDash([])
      
      const freq = this.getFreqForX(this.mouse.x)
      const level = this.getLevelForY(this.mouse.y)
      
      const tooltipX = this.mouse.x + 15
      const tooltipY = this.mouse.y + 15
      const tooltipW = 160
      const tooltipH = 60
      
      ctx.fillStyle = 'rgba(0, 20, 40, 0.9)'
      ctx.strokeStyle = 'rgba(100, 150, 200, 0.5)'
      ctx.lineWidth = 1
      ctx.fillRect(tooltipX, tooltipY, tooltipW, tooltipH)
      ctx.strokeRect(tooltipX, tooltipY, tooltipW, tooltipH)
      
      ctx.fillStyle = '#cce0ff'
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      
      ctx.fillText(`频率: ${this._formatFreq(freq)}`, tooltipX + 8, tooltipY + 8)
      ctx.fillText(`电平: ${level.toFixed(2)} dBm`, tooltipX + 8, tooltipY + 28)
      
      if (this.levelIndicator) {
        ctx.fillText(`本振: ${this._formatFreq(this._calcLO(freq))}`, tooltipX + 8, tooltipY + 48)
      }
    }
    
    ctx.restore()
  }
  
  _drawHighlightedSignals(ctx) {
    const { plotArea } = this
    
    this.highlightedSignals.forEach(signal => {
      const freqStart = signal.freq - signal.bandwidth / 2
      const freqEnd = signal.freq + signal.bandwidth / 2
      
      const xStart = this.getXForFreq(freqStart)
      const xEnd = this.getXForFreq(freqEnd)
      
      if (xEnd < plotArea.x || xStart > plotArea.x + plotArea.width) return
      
      ctx.fillStyle = (signal.color || '#00ff88') + '20'
      ctx.fillRect(xStart, plotArea.y, xEnd - xStart, plotArea.height)
      
      ctx.strokeStyle = signal.color || '#00ff88'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(xStart, plotArea.y, xEnd - xStart, plotArea.height)
      ctx.setLineDash([])
      
      if (signal.maxLevel !== undefined) {
        const y = this.getYForLevel(signal.maxLevel)
        ctx.strokeStyle = signal.color || '#00ff88'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(xStart, y)
        ctx.lineTo(xEnd, y)
        ctx.stroke()
        
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`${signal.maxLevel.toFixed(1)} dBm`, (xStart + xEnd) / 2, y - 5)
      }
    })
  }
  
  _drawRectMarkers(ctx) {
    const { plotArea } = this
    
    this.rectMarkers.forEach(marker => {
      const x = this.getXForFreq(marker.freq)
      const y = this.getYForLevel(marker.level || this.config.refLevel)
      const width = marker.width || 50
      const height = marker.height || 30
      
      ctx.strokeStyle = marker.color || '#ff9800'
      ctx.lineWidth = 2
      ctx.strokeRect(x - width / 2, y - height, width, height)
      
      if (marker.label) {
        ctx.fillStyle = marker.color || '#ff9800'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(marker.label, x, y - height - 5)
      }
    })
  }
  
  _drawRainHand() {
    const ctx = this.contexts.rainHand
    const { waterfallArea } = this
    const w = waterfallArea.width
    const h = waterfallArea.height
    
    ctx.clearRect(0, 0, w * this.dpr, h * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    if (this.fallsSelection) {
      const { startX, startY, endX, endY } = this.fallsSelection
      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)
      
      ctx.fillStyle = 'rgba(255, 235, 59, 0.2)'
      ctx.strokeStyle = '#ffeb3b'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      
      ctx.fillRect(x, y, width, height)
      ctx.strokeRect(x, y, width, height)
      
      ctx.setLineDash([])
    }
    
    if (this.playLineIndex >= 0 && this.waterfallData.length > 0) {
      const y = (this.playLineIndex / this.waterfallData.length) * h
      
      ctx.strokeStyle = '#ff4d4d'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
      
      ctx.fillStyle = '#ff4d4d'
      ctx.beginPath()
      ctx.moveTo(0, y - 6)
      ctx.lineTo(10, y)
      ctx.lineTo(0, y + 6)
      ctx.closePath()
      ctx.fill()
      
      this._drawRainMarkers(ctx, w, h)
    }
    
    ctx.restore()
  }
  
  _drawRainMarkers(ctx, w, h) {
    const { waterfallArea, config } = this
    
    this.rainMarkers.forEach(marker => {
      const xStart = this.getXForFreq(marker.startFreq) - waterfallArea.x
      const xEnd = this.getXForFreq(marker.endFreq) - waterfallArea.x
      
      let yStart, yEnd
      
      if (marker.timeRange) {
        const totalLines = this.waterfallData.length
        yStart = (marker.timeRange[0] / totalLines) * h
        yEnd = (marker.timeRange[1] / totalLines) * h
      } else if (marker.followPlayLine && this.playLineIndex >= 0) {
        const markerHeight = marker.height || 40
        const centerY = (this.playLineIndex / this.waterfallData.length) * h
        yStart = centerY - markerHeight / 2
        yEnd = centerY + markerHeight / 2
      } else {
        yStart = 0
        yEnd = h
      }
      
      const rectX = Math.max(0, xStart)
      const rectY = Math.max(0, yStart)
      const rectW = Math.min(w, xEnd) - rectX
      const rectH = Math.min(h, yEnd) - rectY
      
      if (rectW <= 0 || rectH <= 0) return
      
      ctx.fillStyle = (marker.color || '#ff9800') + '30'
      ctx.strokeStyle = marker.color || '#ff9800'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      
      ctx.fillRect(rectX, rectY, rectW, rectH)
      ctx.strokeRect(rectX, rectY, rectW, rectH)
      
      ctx.setLineDash([])
      
      if (marker.label) {
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(marker.label, rectX + 5, rectY + 5)
      }
    })
  }
  
  _countBoxSelect() {
    if (!this.fallsSelection) return null
    
    const { startX, startY, endX, endY } = this.fallsSelection
    const { waterfallArea, config } = this
    
    const minX = Math.min(startX, endX) - waterfallArea.x
    const maxX = Math.max(startX, endX) - waterfallArea.x
    const minY = Math.min(startY, endY)
    const maxY = Math.max(startY, endY)
    
    const xRatioStart = Math.max(0, minX / waterfallArea.width)
    const xRatioEnd = Math.min(1, maxX / waterfallArea.width)
    
    const zoomedStartX = config.zoomX[0] + xRatioStart * (config.zoomX[1] - config.zoomX[0])
    const zoomedEndX = config.zoomX[0] + xRatioEnd * (config.zoomX[1] - config.zoomX[0])
    
    const startFreq = config.centerFreq - config.span / 2 + zoomedStartX * config.span
    const endFreq = config.centerFreq - config.span / 2 + zoomedEndX * config.span
    
    const lines = this.waterfallData.length
    const startLine = Math.max(0, Math.floor(minY / waterfallArea.height * lines))
    const endLine = Math.min(lines - 1, Math.ceil(maxY / waterfallArea.height * lines))
    
    const selectData = []
    for (let i = startLine; i <= endLine; i++) {
      const line = this.waterfallData[i]
      if (line) {
        const startIdx = Math.max(0, Math.floor(zoomedStartX * line.length))
        const endIdx = Math.min(line.length - 1, Math.ceil(zoomedEndX * line.length))
        selectData.push(line.slice(startIdx, endIdx + 1))
      }
    }
    
    return {
      startFreq,
      endFreq,
      startLine,
      endLine,
      selectData,
      pixelRect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      freqRange: endFreq - startFreq,
      timeRange: endLine - startLine + 1
    }
  }
  
  getPlaceForFreq(freq) {
    return this.getXForFreq(freq)
  }
  
  getFreqForX(x) {
    const { plotArea, config } = this
    const ratio = (x - plotArea.x) / plotArea.width
    const zoomedRatio = config.zoomX[0] + ratio * (config.zoomX[1] - config.zoomX[0])
    return config.centerFreq - config.span / 2 + zoomedRatio * config.span
  }
  
  getXForFreq(freq) {
    const { plotArea, config } = this
    const ratio = (freq - (config.centerFreq - config.span / 2)) / config.span
    const zoomedRatio = (ratio - config.zoomX[0]) / (config.zoomX[1] - config.zoomX[0])
    return plotArea.x + zoomedRatio * plotArea.width
  }
  
  getLevelForY(y) {
    const { plotArea, config } = this
    const ratio = (y - plotArea.y) / plotArea.height
    const zoomedRatio = config.zoomY[0] + ratio * (config.zoomY[1] - config.zoomY[0])
    return config.refLevel - zoomedRatio * (config.refLevel - config.minLevel)
  }
  
  getYForLevel(level) {
    const { plotArea, config } = this
    const ratio = (config.refLevel - level) / (config.refLevel - config.minLevel)
    const zoomedRatio = (ratio - config.zoomY[0]) / (config.zoomY[1] - config.zoomY[0])
    return plotArea.y + zoomedRatio * plotArea.height
  }
  
  _getDataLevelAtFreq(freq) {
    if (!this.spectrumData || this.spectrumData.length === 0) return this.config.minLevel
    
    const ratio = (freq - (this.config.centerFreq - this.config.span / 2)) / this.config.span
    const idx = Math.floor(ratio * this.spectrumData.length)
    return this.spectrumData[Math.max(0, Math.min(this.spectrumData.length - 1, idx))] || this.config.minLevel
  }

  _getHoverData(x, y) {
    if (!this.spectrumData || this.spectrumData.length === 0) {
      return { freq: this.getFreqForX(x), level: this.getLevelForY(y) }
    }
    
    const points = this.spectrumData.length
    const { plotArea, config } = this
    
    const xRatio = (x - plotArea.x) / plotArea.width
    const zoomedXRatio = config.zoomX[0] + xRatio * (config.zoomX[1] - config.zoomX[0])
    const currentIndex = Math.round(zoomedXRatio * (points - 1))
    const clampedIndex = Math.max(0, Math.min(points - 1, currentIndex))
    
    const currentFreq = config.centerFreq - config.span / 2 + zoomedXRatio * config.span
    const currentLevel = this.spectrumData[clampedIndex]
    
    const searchRange = Math.max(5, Math.floor(points * 0.05))
    const startIdx = Math.max(0, clampedIndex - searchRange)
    const endIdx = Math.min(points - 1, clampedIndex + searchRange)
    
    let maxLevel = -Infinity
    let maxIndex = clampedIndex
    for (let i = startIdx; i <= endIdx; i++) {
      if (this.spectrumData[i] > maxLevel) {
        maxLevel = this.spectrumData[i]
        maxIndex = i
      }
    }
    
    const maxFreqRatio = maxIndex / (points - 1)
    const maxFreq = config.centerFreq - config.span / 2 + maxFreqRatio * config.span
    
    const visibleSpan = config.span * (config.zoomX[1] - config.zoomX[0])
    const bandwidth = visibleSpan / points
    
    let leftIdx = clampedIndex
    for (let i = clampedIndex; i >= startIdx; i--) {
      if (this.spectrumData[i] < maxLevel - 3) {
        leftIdx = i
        break
      }
    }
    let rightIdx = clampedIndex
    for (let i = clampedIndex; i <= endIdx; i++) {
      if (this.spectrumData[i] < maxLevel - 3) {
        rightIdx = i
        break
      }
    }
    const signalBandwidth = (rightIdx - leftIdx) * bandwidth
    
    const skyFreq = maxFreq
    const accessFreq = maxFreq * 0.95
    
    return {
      freq: currentFreq,
      level: currentLevel,
      maxLevel,
      maxFreq,
      bandwidth: signalBandwidth > 0 ? signalBandwidth : bandwidth,
      skyFreq,
      accessFreq,
      index: clampedIndex
    }
  }
  
  _calcLO(freq) {
    return freq * 0.95
  }
  
  _formatFreq(freq) {
    if (freq >= 1e9) return `${(freq / 1e9).toFixed(3)} GHz`
    if (freq >= 1e6) return `${(freq / 1e6).toFixed(3)} MHz`
    if (freq >= 1e3) return `${(freq / 1e3).toFixed(3)} kHz`
    return `${freq.toFixed(0)} Hz`
  }
  
  addMarker(marker) {
    this.markers.push(marker)
    this._drawActiveLayer()
  }
  
  removeMarker(id) {
    this.markers = this.markers.filter(m => m.id !== id)
    this._drawActiveLayer()
  }
  
  clearMarkers() {
    this.markers = []
    this._drawActiveLayer()
  }
  
  addHighlightedSignal(signal) {
    const existing = this.highlightedSignals.find(s => s.freq === signal.freq && s.bandwidth === signal.bandwidth)
    if (!existing) {
      this.highlightedSignals.push({
        id: signal.id || Date.now(),
        ...signal
      })
    }
    this._drawActiveLayer()
  }
  
  removeHighlightedSignal(id) {
    this.highlightedSignals = this.highlightedSignals.filter(s => s.id !== id)
    this._drawActiveLayer()
  }
  
  clearHighlightedSignals() {
    this.highlightedSignals = []
    this._drawActiveLayer()
  }
  
  addRectMarker(marker) {
    this.rectMarkers.push({
      id: marker.id || Date.now(),
      ...marker
    })
    this._drawActiveLayer()
  }
  
  removeRectMarker(id) {
    this.rectMarkers = this.rectMarkers.filter(m => m.id !== id)
    this._drawActiveLayer()
  }
  
  clearRectMarkers() {
    this.rectMarkers = []
    this._drawActiveLayer()
  }
  
  addRainMarker(marker) {
    this.rainMarkers.push({
      id: marker.id || Date.now(),
      ...marker
    })
    this._drawRainHand()
  }
  
  updateRainMarker(id, data) {
    const marker = this.rainMarkers.find(m => m.id === id)
    if (marker) {
      Object.assign(marker, data)
      this._drawRainHand()
    }
  }
  
  removeRainMarker(id) {
    this.rainMarkers = this.rainMarkers.filter(m => m.id !== id)
    this._drawRainHand()
  }
  
  clearRainMarkers() {
    this.rainMarkers = []
    this._drawRainHand()
  }
  
  setZoom(zoomX, zoomY) {
    if (zoomX) this.config.zoomX = zoomX
    if (zoomY) this.config.zoomY = zoomY
    this.render()
  }
  
  resetZoom() {
    this.config.zoomX = [0, 1]
    this.config.zoomY = [0, 1]
    this.render()
  }
  
  pause() {
    this.isPaused = true
    this._emit('pause')
  }
  
  play() {
    this.isPaused = false
    this.isPlayingBack = false
    this.playbackData = null
    this.playbackIndex = 0
    this.playLineIndex = -1
    this._drawRainHand()
    this._emit('play')
  }
  
  startPlayback(data, onFrame) {
    if (!data || data.length === 0) return
    
    this.isPlayingBack = true
    this.isPaused = true
    this.playbackData = data
    this.playbackIndex = 0
    this._playbackOnFrame = onFrame
    
    this._playbackTick()
    this._emit('playbackStart')
  }
  
  _playbackTick() {
    if (!this.isPlayingBack || !this.playbackData) return
    
    const frame = this.playbackData[this.playbackIndex]
    if (frame) {
      this.beginDraw(frame)
      this.playLineIndex = this.playbackIndex
      this._drawRainHand()
      
      if (this._playbackOnFrame) {
        this._playbackOnFrame({
          frame: this.playbackIndex,
          total: this.playbackData.length,
          data: frame
        })
      }
    }
    
    this.playbackIndex++
    if (this.playbackIndex >= this.playbackData.length) {
      this.playbackIndex = 0
    }
    
    this._playbackTimer = setTimeout(() => this._playbackTick(), 100)
  }
  
  stopPlayback() {
    this.isPlayingBack = false
    if (this._playbackTimer) {
      clearTimeout(this._playbackTimer)
      this._playbackTimer = null
    }
    this.playbackData = null
    this.playbackIndex = 0
    this.playLineIndex = -1
    this._drawRainHand()
    this._emit('playbackStop')
  }
  
  clearWaterfall() {
    this.waterfallData = []
    this._drawWaterfall()
  }
  
  setConfig(config) {
    Object.assign(this.config, config)
    this.render()
  }
  
  render() {
    this._updateAxis()
    this._drawSpectrum()
    
    if (this.config.waterfallVisible) {
      this._drawWaterfall()
    }
    
    this._drawActiveLayer()
  }
  
  destroy() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    if (this._playbackTimer) clearTimeout(this._playbackTimer)
    
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }
    
    if (this.imageBitmapCache) {
      this.imageBitmapCache.close()
    }
    
    this.spectrumWorker?.terminate()
    this.sampleWorker?.terminate()
    
    this.callbacks = {}
    this.container.innerHTML = ''
  }
}
