const DEFAULT_CONFIG = {
  padding: { top: 10, right: 10, bottom: 10, left: 60 },
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
    fields: ['centerFreq', 'bandwidth', 'maxLevel'],
    customFields: [],
    menuButtons: []
  },
  playbackSpeed: 1000
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
    this.config.hoverInfo = { ...DEFAULT_CONFIG.hoverInfo, ...config.hoverInfo }
    
    this.layers = {}
    this.contexts = {}
    
    this.spectrumData = null
    this.maxHoldData = null
    this.minHoldData = null
    this.avgData = null
    this.waterfallData = []
    
    this.markers = []
    this.rainMarkers = []
    this.fallsSelection = null
    this.playLineIndex = -1
    this.isPaused = false
    this.isPlayingBack = false
    this.playbackData = null
    this.playbackIndex = 0
    this._playbackTimer = null
    this._playbackOnFrame = null
    
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
    
    this._events = new (class {
      constructor() { this.map = {} }
      on(t, fn) { (this.map[t] ||= []).push(fn) }
      off(t, fn) { this.map[t] = (this.map[t] || []).filter(f => f !== fn) }
      emit(t, d) { (this.map[t] || []).forEach(fn => fn(d)) }
    })()
    
    this._imageBitmapCache = null
    this._resizeTimer = null
    this._resizeObserver = null
    
    this._initContainer()
    this._initLayout()
    this._initWorkers()
    this._initEvents()
    this._initResizeObserver()
  }
  
  _initContainer() {
    this.container.innerHTML = ''
    this.container.style.position = 'relative'
    this.container.style.overflow = 'hidden'
    this.width = this.container.clientWidth
    this.height = this.container.clientHeight
    this.dpr = window.devicePixelRatio || 1
  }
  
  _initLayout() {
    const { padding, waterfallHeight, waterfallVisible } = this.config
    
    const legendHeight = 24
    const xLabelHeight = 20
    const gap = 10
    const colorBarWidth = 80
    
    const plotTop = padding.top + legendHeight
    const availableHeight = this.height - padding.top - padding.bottom
    const totalExtraHeight = legendHeight + xLabelHeight + (waterfallVisible ? gap + waterfallHeight + xLabelHeight : 0)
    const freqHeight = Math.max(50, availableHeight - totalExtraHeight)
    
    const plotWidth = this.width - padding.left - padding.right - colorBarWidth
    
    this.plotArea = {
      x: padding.left,
      y: plotTop,
      width: plotWidth,
      height: freqHeight
    }
    
    const waterfallTop = plotTop + freqHeight + xLabelHeight + gap
    
    this.waterfallArea = {
      x: padding.left,
      y: waterfallTop,
      width: plotWidth,
      height: waterfallVisible ? waterfallHeight : 0
    }
    
    this._layout = {
      legendHeight,
      xLabelHeight,
      gap,
      colorBarWidth,
      freqDivHeight: waterfallTop + (waterfallVisible ? 0 : xLabelHeight)
    }
    
    const freqDiv = document.createElement('div')
    freqDiv.className = 'freq-div'
    freqDiv.style.cssText = `
      position: absolute;
      left: 0; top: 0;
      width: 100%;
      height: ${waterfallTop + (waterfallVisible ? 0 : xLabelHeight)}px;
    `
    
    const rainDiv = document.createElement('div')
    rainDiv.className = 'rain-div'
    rainDiv.style.cssText = `
      position: absolute;
      left: 0; top: ${waterfallTop}px;
      width: 100%;
      height: ${waterfallVisible ? waterfallHeight + xLabelHeight : 0}px;
    `
    
    const freqCanvasHeight = waterfallTop + (waterfallVisible ? 0 : xLabelHeight)
    const rainCanvasHeight = waterfallVisible ? waterfallHeight + xLabelHeight : 0
    
    this.layers.freq = {
      baseLayer: this._createCanvas('base-layer', freqDiv, this.width, freqCanvasHeight),
      lineLayer: this._createCanvas('line-layer', freqDiv, this.width, freqCanvasHeight),
      activeLayer: this._createCanvas('active-layer', freqDiv, this.width, freqCanvasHeight),
      legendCanvas: this._createCanvas('legend-canvas', freqDiv, this.width, freqCanvasHeight)
    }
    
    this.layers.rain = {
      rainCanvas: this._createCanvas('rain-canvas', rainDiv, this.width, rainCanvasHeight),
      rainHandCanvas: this._createCanvas('rain-hand-canvas', rainDiv, this.width, rainCanvasHeight),
      rainLegendCanvas: this._createCanvas('rain-legend-canvas', rainDiv, this.width, rainCanvasHeight)
    }
    
    this.contexts = {
      base: this.layers.freq.baseLayer.getContext('2d'),
      line: this.layers.freq.lineLayer.getContext('2d'),
      active: this.layers.freq.activeLayer.getContext('2d'),
      legend: this.layers.freq.legendCanvas.getContext('2d'),
      rain: this.layers.rain.rainCanvas.getContext('2d'),
      rainHand: this.layers.rain.rainHandCanvas.getContext('2d'),
      rainLegend: this.layers.rain.rainLegendCanvas.getContext('2d')
    }
    
    this.freqDiv = freqDiv
    this.rainDiv = rainDiv
    
    this.container.appendChild(freqDiv)
    this.container.appendChild(rainDiv)
  }
  
  _createCanvas(className, parent, w, h) {
    const canvas = document.createElement('canvas')
    canvas.className = className
    canvas.style.cssText = `
      position: absolute;
      left: 0; top: 0;
      width: ${w}px;
      height: ${h}px;
    `
    canvas.width = w * this.dpr
    canvas.height = h * this.dpr
    parent.appendChild(canvas)
    return canvas
  }
  
  _resizeAllCanvases(w, freqH, rainH) {
    const freqCanvases = [this.layers.freq.baseLayer, this.layers.freq.lineLayer, this.layers.freq.activeLayer, this.layers.freq.legendCanvas]
    freqCanvases.forEach(c => {
      c.width = w * this.dpr
      c.height = freqH * this.dpr
      c.style.width = w + 'px'
      c.style.height = freqH + 'px'
    })
    
    const rainCanvases = [this.layers.rain.rainCanvas, this.layers.rain.rainHandCanvas, this.layers.rain.rainLegendCanvas]
    rainCanvases.forEach(c => {
      c.width = w * this.dpr
      c.height = rainH * this.dpr
      c.style.width = w + 'px'
      c.style.height = rainH + 'px'
    })
  }
  
  _initWorkers() {
    try {
      this.spectrumWorker = new Worker(new URL('./workers/SpectrumWorker.js', import.meta.url), { type: 'module' })
      this.sampleWorker = new Worker(new URL('./workers/SampleWorker.js', import.meta.url), { type: 'module' })
      
      this.spectrumWorker.onmessage = (e) => {
        const { type, data } = e.data
        if (type === 'holdLines') {
          if (data.maxHold) this.maxHoldData = new Float32Array(data.maxHold)
          if (data.minHold) this.minHoldData = new Float32Array(data.minHold)
          if (data.avg) this.avgData = new Float32Array(data.avg)
          this._drawHoldLines()
        }
      }
      
      this.sampleWorker.onmessage = (e) => {
        const { type, data } = e.data
        if (type === 'sampled') {
          this._drawSpectrumLine(new Float32Array(data.sampled))
        }
      }
      
      this._workersReady = true
    } catch (e) {
      console.warn('WebWorker init failed, fallback to main thread:', e)
      this._workersReady = false
    }
  }
  
  _initEvents() {
    const activeCanvas = this.layers.freq.activeLayer
    const rainHandCanvas = this.layers.rain.rainHandCanvas
    
    activeCanvas.addEventListener('mousemove', this._onMouseMove.bind(this))
    activeCanvas.addEventListener('mousedown', this._onMouseDown.bind(this))
    activeCanvas.addEventListener('mouseup', this._onMouseUp.bind(this))
    activeCanvas.addEventListener('mouseleave', this._onMouseLeave.bind(this))
    activeCanvas.addEventListener('wheel', this._onWheel.bind(this))
    activeCanvas.addEventListener('contextmenu', (e) => e.preventDefault())
    
    rainHandCanvas.addEventListener('mousemove', this._onRainMouseMove.bind(this))
    rainHandCanvas.addEventListener('mousedown', this._onRainMouseDown.bind(this))
    rainHandCanvas.addEventListener('mouseup', this._onRainMouseUp.bind(this))
    rainHandCanvas.addEventListener('mouseleave', this._onRainMouseLeave.bind(this))
    rainHandCanvas.addEventListener('wheel', this._onRainWheel.bind(this))
    rainHandCanvas.addEventListener('contextmenu', (e) => e.preventDefault())
    
    window.addEventListener('resize', this._onResize.bind(this))
  }
  
  _initResizeObserver() {
    if (typeof ResizeObserver === 'undefined') {
      this._checkInitialSize()
      return
    }
    
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          if (this._resizeTimer) clearTimeout(this._resizeTimer)
          this._resizeTimer = setTimeout(() => {
            this.resize()
          }, 100)
        }
      }
    })
    
    this._resizeObserver.observe(this.container)
    this._checkInitialSize()
  }
  
  _checkInitialSize() {
    const check = () => {
      const w = this.container.clientWidth
      const h = this.container.clientHeight
      if (w > 0 && h > 0 && (w !== this.width || h !== this.height)) {
        this.resize()
      }
    }
    requestAnimationFrame(() => {
      check()
      setTimeout(check, 50)
      setTimeout(check, 200)
    })
  }
  
  _onMouseMove(e) {
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
      this._onPan(x, y)
    }
    
    this._drawActiveLayer()
    this._events.emit('hover', { x, y, freq: this.getFreqForX(x), level: this.getLevelForY(y) })
  }
  
  _onMouseDown(e) {
    const rect = this.layers.freq.activeLayer.getBoundingClientRect()
    this.mouse.isDown = true
    this.mouse.button = e.button
    this.mouse.downX = e.clientX - rect.left
    this.mouse.downY = e.clientY - rect.top
    this.mouse.isDragging = false
    this.mouse.isRightDragging = false
  }
  
  _onMouseUp(e) {
    const rect = this.layers.freq.activeLayer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const now = Date.now()
    
    if (!this.mouse.isDragging && e.button === 0) {
      if (now - this.mouse.lastClickTime < 300 &&
          Math.abs(x - this.mouse.lastClickX) < 5 &&
          Math.abs(y - this.mouse.lastClickY) < 5) {
        this._onDoubleClick(x, y)
      } else {
        this.mouse.lastClickTime = now
        this.mouse.lastClickX = x
        this.mouse.lastClickY = y
        this._onClick(x, y)
      }
    }
    
    this.mouse.isDown = false
    this.mouse.button = -1
    this.mouse.isDragging = false
    
    this._drawActiveLayer()
  }
  
  _onMouseLeave() {
    this.mouse.isDown = false
    this.mouse.isDragging = false
    this.mouse.isRightDragging = false
    this._drawActiveLayer()
    this._events.emit('hoverEnd')
  }
  
  _onWheel(e) {
    e.preventDefault()
    
    const rect = this.layers.freq.activeLayer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const factor = e.deltaY > 0 ? 1.1 : 0.9
    
    if (e.shiftKey) {
      this._zoomY(y, factor)
    } else {
      this._zoomX(x, factor)
    }
    
    this._events.emit('zoom', { zoomX: [...this.config.zoomX], zoomY: [...this.config.zoomY] })
    this.render()
  }
  
  _zoomX(anchorX, factor) {
    const [z0, z1] = this.config.zoomX
    const range = z1 - z0
    
    const anchorRatio = Math.max(0, Math.min(1, (anchorX - this.plotArea.x) / this.plotArea.width))
    const anchorInData = z0 + anchorRatio * range
    
    const newRange = range * factor
    const newZ0 = anchorInData - anchorRatio * newRange
    const newZ1 = anchorInData + (1 - anchorRatio) * newRange
    
    let nz0 = Math.max(0, Math.min(1, newZ0))
    let nz1 = Math.max(0, Math.min(1, newZ1))
    
    if (nz1 - nz0 < 0.001) {
      nz0 = z0
      nz1 = z1
    }
    
    this.config.zoomX = [nz0, nz1]
  }
  
  _zoomY(anchorY, factor) {
    const [z0, z1] = this.config.zoomY
    const range = z1 - z0
    
    const anchorRatio = Math.max(0, Math.min(1, (anchorY - this.plotArea.y) / this.plotArea.height))
    const anchorInData = z0 + anchorRatio * range
    
    const newRange = range * factor
    const newZ0 = anchorInData - anchorRatio * newRange
    const newZ1 = anchorInData + (1 - anchorRatio) * newRange
    
    let nz0 = Math.max(0, Math.min(1, newZ0))
    let nz1 = Math.max(0, Math.min(1, newZ1))
    
    if (nz1 - nz0 < 0.001) {
      nz0 = z0
      nz1 = z1
    }
    
    this.config.zoomY = [nz0, nz1]
  }
  
  _onPan(x, y) {
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
  
  _onClick(x, y) {
    this._events.emit('click', { x, y, freq: this.getFreqForX(x), level: this.getLevelForY(y) })
  }
  
  _onDoubleClick(x, y) {
    const clickedMarker = this.markers.find(m => {
      const mx = this.getXForFreq(m.freq)
      const my = this.getYForLevel(m.level !== undefined ? m.level : this._getDataLevelAtFreq(m.freq))
      const hitRadius = 10
      return Math.abs(mx - x) < hitRadius && Math.abs(my - y) < hitRadius
    })
    
    if (clickedMarker) {
      this._events.emit('doubleClickMarker', { marker: clickedMarker, markerId: clickedMarker.id, x, y })
      return
    }
    
    const rectMarker = this.markers.find(m => {
      if (m.startFreq === undefined || m.endFreq === undefined) return false
      const mx1 = this.getXForFreq(m.startFreq)
      const mx2 = this.getXForFreq(m.endFreq)
      const my1 = m.startLevel !== undefined ? this.getYForLevel(m.startLevel) : this.plotArea.y
      const my2 = m.endLevel !== undefined ? this.getYForLevel(m.endLevel) : this.plotArea.y + this.plotArea.height
      
      const minX = Math.min(mx1, mx2)
      const maxX = Math.max(mx1, mx2)
      const minY = Math.min(my1, my2)
      const maxY = Math.max(my1, my2)
      
      return x >= minX && x <= maxX && y >= minY && y <= maxY
    })
    
    if (rectMarker) {
      this._events.emit('doubleClickMarker', { marker: rectMarker, markerId: rectMarker.id, x, y })
      return
    }
    
    this._events.emit('doubleClick', { x, y, freq: this.getFreqForX(x), level: this.getLevelForY(y) })
  }
  
  _onRainMouseMove(e) {
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
  
  _onRainMouseDown(e) {
    const rect = this.layers.rain.rainHandCanvas.getBoundingClientRect()
    this.mouse.isDown = true
    this.mouse.button = e.button
    this.mouse.downX = e.clientX - rect.left
    this.mouse.downY = e.clientY - rect.top
    this.mouse.isRightDragging = false
  }
  
  _onRainMouseUp(e) {
    const rect = this.layers.rain.rainHandCanvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    if (this.mouse.isRightDragging && e.button === 2) {
      const result = this._countBoxSelect()
      if (result) {
        this._events.emit('fallsSelectComplate', result)
      }
    }
    
    this.mouse.isDown = false
    this.mouse.button = -1
    this.mouse.isRightDragging = false
    
    this._drawRainHand()
  }
  
  _onRainMouseLeave() {
    this.mouse.isDown = false
    this.mouse.isRightDragging = false
    this._drawRainHand()
  }
  
  _onRainWheel(e) {
    e.preventDefault()
    const rect = this.layers.rain.rainHandCanvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const factor = e.deltaY > 0 ? 1.1 : 0.9
    this._zoomX(x + this.waterfallArea.x, factor)
    this._events.emit('zoom', { zoomX: [...this.config.zoomX], zoomY: [...this.config.zoomY] })
    this.render()
  }
  
  _onResize() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    this._resizeTimer = setTimeout(() => {
      this.resize()
    }, 100)
  }
  
  on(event, callback) {
    this._events.on(event, callback)
  }
  
  off(event, callback) {
    this._events.off(event, callback)
  }
  
  addData(data) {
    if (this.isPaused && !this.isPlayingBack) return
    
    this.spectrumData = data
    
    if (this.config.waterfallVisible && !this.isPlayingBack) {
      this.waterfallData.unshift(new Float32Array(data))
      if (this.waterfallData.length > 500) {
        this.waterfallData.pop()
      }
    }
    
    if (this.config.maxHold || this.config.minHold || this.config.avgHold) {
      this._updateHoldLines(data)
    }
    
    this._drawSpectrum()
    
    if (this.config.waterfallVisible) {
      this._drawWaterfall()
    }
    
    this._drawBaseLayer()
    this._drawLegend()
    this._drawRainLegend()
    this._drawActiveLayer()
  }
  
  beginDraw(frameData) {
    this.spectrumData = frameData
    this._drawSpectrum()
    this._drawActiveLayer()
  }
  
  updateAxis(config) {
    if (config) {
      Object.assign(this.config, config)
    }
    this.render()
  }
  
  _updateHoldLines(spectrum) {
    if (!spectrum || spectrum.length === 0) return
    
    if (this._workersReady && this.spectrumWorker) {
      try {
        this.spectrumWorker.postMessage({
          type: 'updateHold',
          data: {
            spectrum: new Float32Array(spectrum),
            maxHold: this.config.maxHold,
            minHold: this.config.minHold,
            avgHold: this.config.avgHold
          }
        })
      } catch (e) {
        console.warn('SpectrumWorker postMessage failed, fallback to main thread:', e)
        this._workersReady = false
        this._updateHoldLinesMainThread(spectrum)
      }
    } else {
      this._updateHoldLinesMainThread(spectrum)
    }
  }
  
  _updateHoldLinesMainThread(spectrum) {
    if (!this.maxHoldData || this.maxHoldData.length !== spectrum.length) {
      this.maxHoldData = new Float32Array(spectrum)
      this.minHoldData = new Float32Array(spectrum)
      this.avgData = new Float32Array(spectrum)
      this._avgCount = 1
      return
    }
    
    if (this.config.maxHold) {
      for (let i = 0; i < spectrum.length; i++) {
        if (spectrum[i] > this.maxHoldData[i]) {
          this.maxHoldData[i] = spectrum[i]
        }
      }
    }
    
    if (this.config.minHold) {
      for (let i = 0; i < spectrum.length; i++) {
        if (spectrum[i] < this.minHoldData[i]) {
          this.minHoldData[i] = spectrum[i]
        }
      }
    }
    
    if (this.config.avgHold) {
      this._avgCount = (this._avgCount || 1) + 1
      const alpha = 1 / this._avgCount
      for (let i = 0; i < spectrum.length; i++) {
        this.avgData[i] = this.avgData[i] * (1 - alpha) + spectrum[i] * alpha
      }
    }
    
    this._drawHoldLines()
  }
  
  _drawSpectrum() {
    if (!this.spectrumData || this.spectrumData.length === 0) return
    
    const targetWidth = Math.max(1, Math.floor(this.plotArea.width))
    
    if (this._workersReady && this.sampleWorker) {
      try {
        this.sampleWorker.postMessage({
          type: 'sample',
          data: {
            spectrum: new Float32Array(this.spectrumData),
            targetWidth,
            zoomX: [this.config.zoomX[0], this.config.zoomX[1]]
          }
        })
      } catch (e) {
        console.warn('SampleWorker postMessage failed, fallback to main thread:', e)
        this._workersReady = false
        const visibleData = this._getVisibleData()
        const sampled = this._sampleMax(visibleData, targetWidth)
        this._drawSpectrumLine(sampled)
      }
    } else {
      const visibleData = this._getVisibleData()
      const sampled = this._sampleMax(visibleData, targetWidth)
      this._drawSpectrumLine(sampled)
    }
  }
  
  _getVisibleData() {
    const data = this.spectrumData
    const [z0, z1] = this.config.zoomX
    const start = Math.floor(z0 * data.length)
    const end = Math.ceil(z1 * data.length)
    return data.slice(Math.max(0, start), Math.min(data.length, end))
  }
  
  _sampleMax(data, targetWidth) {
    const safeWidth = Math.max(1, Math.floor(targetWidth))
    if (data.length <= safeWidth) return data
    
    const result = new Float32Array(safeWidth)
    const step = data.length / safeWidth
    
    for (let i = 0; i < safeWidth; i++) {
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
  
  _drawSpectrumLine(sampledData) {
    const ctx = this.contexts.line
    const { plotArea, config } = this
    
    const minLevel = config.refLevel - (config.refLevel - config.minLevel) * config.zoomY[1]
    const maxLevel = config.refLevel - (config.refLevel - config.minLevel) * config.zoomY[0]
    
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
      const y = plotArea.y + Math.max(0, Math.min(1, ratio)) * plotArea.height
      
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    
    ctx.stroke()
    
    if (this.maxHoldData || this.minHoldData || this.avgData) {
      this._drawHoldLinesOnContext(ctx, plotArea, maxLevel, minLevel)
    }
    
    ctx.restore()
  }
  
  _drawHoldLines() {
  }
  
  _drawHoldLinesOnContext(ctx, plotArea, maxLevel, minLevel) {
    const drawLine = (data, color, dashed = false) => {
      if (!data || data.length === 0) return
      
      const targetWidth = Math.floor(plotArea.width)
      const visibleData = this._sampleVisibleFromData(data)
      const sampled = this._sampleMax(visibleData, targetWidth)
      const points = sampled.length
      
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      if (dashed) ctx.setLineDash([5, 3])
      
      ctx.beginPath()
      for (let i = 0; i < points; i++) {
        const x = plotArea.x + (i / Math.max(1, points - 1)) * plotArea.width
        const value = sampled[i]
        const ratio = (maxLevel - value) / (maxLevel - minLevel)
        const y = plotArea.y + Math.max(0, Math.min(1, ratio)) * plotArea.height
        
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    
    if (this.config.maxHold && this.maxHoldData) {
      drawLine(this.maxHoldData, '#ff4d4d', true)
    }
    
    if (this.config.minHold && this.minHoldData) {
      drawLine(this.minHoldData, '#4dd2ff', true)
    }
    
    if (this.config.avgHold && this.avgData) {
      drawLine(this.avgData, '#ffff4d', true)
    }
  }
  
  _sampleVisibleFromData(data) {
    const [z0, z1] = this.config.zoomX
    const start = Math.floor(z0 * data.length)
    const end = Math.ceil(z1 * data.length)
    return data.slice(Math.max(0, start), Math.min(data.length, end))
  }
  
  _drawBaseLayer() {
    const ctx = this.contexts.base
    const { plotArea } = this
    const freqCanvasHeight = this.waterfallArea.y + (this.config.waterfallVisible ? 0 : this._layout.xLabelHeight)
    
    ctx.clearRect(0, 0, this.width * this.dpr, freqCanvasHeight * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    if (this.config.showGrid) {
      ctx.strokeStyle = 'rgba(100, 150, 200, 0.2)'
      ctx.lineWidth = 1
      
      const gridCountX = 5
      const gridCountY = 5
      
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
    }
    
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.5)'
    ctx.strokeRect(plotArea.x, plotArea.y, plotArea.width, plotArea.height)
    
    ctx.fillStyle = '#8ab4d8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    
    const gridCountY = 5
    for (let i = 0; i <= gridCountY; i++) {
      const y = plotArea.y + (plotArea.height / gridCountY) * i
      const level = this.getLevelForY(y)
      ctx.fillText(`${level.toFixed(0)} dBm`, plotArea.x - 5, y)
    }
    
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    
    const gridCountX = 5
    for (let i = 0; i <= gridCountX; i++) {
      const x = plotArea.x + (plotArea.width / gridCountX) * i
      const freq = this.getFreqForX(x)
      ctx.fillText(this._formatFreq(freq), x, plotArea.y + plotArea.height + 3)
    }
    
    ctx.restore()
  }
  
  async _drawWaterfall() {
    const ctx = this.contexts.rain
    const { waterfallArea } = this
    const w = Math.floor(waterfallArea.width * this.dpr)
    const h = Math.floor(waterfallArea.height * this.dpr)
    
    if (this._imageBitmapCache) {
      this._imageBitmapCache.close()
      this._imageBitmapCache = null
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
        const pointIndex = Math.min(lineData.length - 1, Math.max(0, Math.floor(zoomedX * lineData.length)))
        const value = lineData[pointIndex]
        
        const color = this._getWaterfallColor(value)
        const idx = (py * w + px) * 4
        
        data[idx] = color.r
        data[idx + 1] = color.g
        data[idx + 2] = color.b
        data[idx + 3] = 255
      }
    }
    
    ctx.clearRect(0, 0, this.width * this.dpr, waterfallArea.height * this.dpr)
    ctx.putImageData(imageData, waterfallArea.x * this.dpr, 0)
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
    const { plotArea, config } = this
    
    if (!config.showLegend) return
    
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    const legends = []
    legends.push({ color: '#00ff66', label: '实时频谱' })
    if (config.maxHold) legends.push({ color: '#ff4d4d', label: '最大保持' })
    if (config.minHold) legends.push({ color: '#4dd2ff', label: '最小保持' })
    if (config.avgHold) legends.push({ color: '#ffff4d', label: '平均' })
    
    const legendY = config.padding.top + 4
    
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    
    let currentX = plotArea.x
    legends.forEach((legend) => {
      ctx.fillStyle = legend.color
      ctx.fillRect(currentX, legendY, 14, 14)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(currentX, legendY, 14, 14)
      
      ctx.fillStyle = '#cce0ff'
      ctx.fillText(legend.label, currentX + 20, legendY + 1)
      
      currentX += 20 + ctx.measureText(legend.label).width + 20
    })
    
    ctx.restore()
  }
  
  _drawRainLegend() {
    const ctx = this.contexts.rainLegend
    const { waterfallArea } = this
    const rainCanvasHeight = waterfallArea.height + this._layout.xLabelHeight
    
    ctx.clearRect(0, 0, this.width * this.dpr, rainCanvasHeight * this.dpr)
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
    
    const gridCountX = 5
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    
    for (let i = 0; i <= gridCountX; i++) {
      const x = waterfallArea.x + (waterfallArea.width / gridCountX) * i
      const freq = this.getFreqForX(x)
      ctx.fillText(this._formatFreq(freq), x, waterfallArea.height + 2)
    }
    
    ctx.restore()
  }
  
  _drawActiveLayer() {
    const ctx = this.contexts.active
    const { plotArea } = this
    const freqCanvasHeight = this.waterfallArea.y + (this.config.waterfallVisible ? 0 : this._layout.xLabelHeight)
    
    ctx.clearRect(0, 0, this.width * this.dpr, freqCanvasHeight * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    this.markers.forEach(marker => {
      if (marker.startFreq !== undefined && marker.endFreq !== undefined) {
        this._drawRectMarker(ctx, marker)
      } else {
        this._drawPointMarker(ctx, marker)
      }
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
      
      this._drawHoverTooltip(ctx)
    }
    
    ctx.restore()
  }
  
  _drawPointMarker(ctx, marker) {
    const { plotArea } = this
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
  }
  
  _drawRectMarker(ctx, marker) {
    const { plotArea } = this
    const x1 = this.getXForFreq(marker.startFreq)
    const x2 = this.getXForFreq(marker.endFreq)
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    
    const y1 = marker.startLevel !== undefined ? this.getYForLevel(marker.startLevel) : plotArea.y
    const y2 = marker.endLevel !== undefined ? this.getYForLevel(marker.endLevel) : plotArea.y + plotArea.height
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    
    ctx.fillStyle = (marker.color || '#ffeb3b') + '33'
    ctx.strokeStyle = marker.color || '#ffeb3b'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 3])
    
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
    
    ctx.setLineDash([])
    
    ctx.fillStyle = marker.color || '#ffeb3b'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('M' + (marker.id || ''), minX + 4, minY + 4)
  }
  
  _drawHoverTooltip(ctx) {
    const freq = this.getFreqForX(this.mouse.x)
    const level = this.getLevelForY(this.mouse.y)
    
    const { hoverInfo } = this.config
    if (!hoverInfo.visible) return
    
    const lines = []
    
    if (hoverInfo.fields.includes('centerFreq')) {
      lines.push({ label: '中心频率', value: this._formatFreq(freq) })
    }
    if (hoverInfo.fields.includes('accessFreq')) {
      lines.push({ label: '接入频率', value: this._formatFreq(this._calcLO(freq)) })
    }
    if (hoverInfo.fields.includes('bandwidth')) {
      const bw = this.config.span * (this.config.zoomX[1] - this.config.zoomX[0]) / 10
      lines.push({ label: '带宽', value: this._formatFreq(bw) })
    }
    if (hoverInfo.fields.includes('maxLevel')) {
      lines.push({ label: '电平', value: `${level.toFixed(2)} dBm` })
    }
    
    if (hoverInfo.customFields && hoverInfo.customFields.length > 0) {
      hoverInfo.customFields.forEach(f => {
        lines.push({ label: f.label, value: f.value })
      })
    }
    
    let maxWidth = 140
    ctx.font = '11px monospace'
    lines.forEach(l => {
      const w = ctx.measureText(l.label + ': ' + l.value).width + 20
      if (w > maxWidth) maxWidth = w
    })
    
    const lineHeight = 18
    const tooltipW = maxWidth
    const tooltipH = lines.length * lineHeight + 10
    let tooltipX = this.mouse.x + 15
    let tooltipY = this.mouse.y + 15
    
    if (tooltipX + tooltipW > this.width) tooltipX = this.mouse.x - tooltipW - 15
    if (tooltipY + tooltipH > this.waterfallArea.y) tooltipY = this.mouse.y - tooltipH - 15
    
    ctx.fillStyle = 'rgba(0, 20, 40, 0.95)'
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.5)'
    ctx.lineWidth = 1
    ctx.fillRect(tooltipX, tooltipY, tooltipW, tooltipH)
    ctx.strokeRect(tooltipX, tooltipY, tooltipW, tooltipH)
    
    ctx.fillStyle = '#cce0ff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    
    lines.forEach((l, i) => {
      ctx.fillText(`${l.label}: ${l.value}`, tooltipX + 8, tooltipY + 6 + i * lineHeight)
    })
    
    if (hoverInfo.menuButtons && hoverInfo.menuButtons.length > 0) {
      const btnY = tooltipY + tooltipH
      const btnH = 22
      const totalBtnW = hoverInfo.menuButtons.length * 60
      
      ctx.fillStyle = 'rgba(0, 30, 60, 0.95)'
      ctx.fillRect(tooltipX, btnY, totalBtnW, btnH)
      ctx.strokeRect(tooltipX, btnY, totalBtnW, btnH)
      
      hoverInfo.menuButtons.forEach((btn, i) => {
        const bx = tooltipX + i * 60
        ctx.fillStyle = '#66b3ff'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(btn.label, bx + 30, btnY + btnH / 2)
      })
    }
  }
  
  _drawRainHand() {
    const ctx = this.contexts.rainHand
    const { waterfallArea } = this
    const w = waterfallArea.width
    const h = waterfallArea.height
    const rainCanvasHeight = h + this._layout.xLabelHeight
    
    ctx.clearRect(0, 0, this.width * this.dpr, rainCanvasHeight * this.dpr)
    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    
    this.rainMarkers.forEach(marker => {
      this._drawRainMarker(ctx, marker)
    })
    
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
    
    if (this.playLineIndex >= 0) {
      let y
      if (this.isPlayingBack && this.playbackData) {
        y = (this.playbackIndex / this.playbackData.length) * h
      } else if (this.waterfallData.length > 0) {
        y = (this.playLineIndex / this.waterfallData.length) * h
      } else {
        y = 0
      }
      
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
    }
    
    ctx.restore()
  }
  
  _drawRainMarker(ctx, marker) {
    const { waterfallArea } = this
    
    const x1 = this.getXForFreq(marker.startFreq) - waterfallArea.x
    const x2 = this.getXForFreq(marker.endFreq) - waterfallArea.x
    const minX = Math.max(0, Math.min(x1, x2))
    const maxX = Math.min(waterfallArea.width, Math.max(x1, x2))
    
    const y1 = (marker.startLine || 0) / Math.max(1, this.waterfallData.length) * waterfallArea.height
    const y2 = (marker.endLine || 0) / Math.max(1, this.waterfallData.length) * waterfallArea.height
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    
    ctx.fillStyle = (marker.color || '#ff9800') + '40'
    ctx.strokeStyle = marker.color || '#ff9800'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
    
    ctx.setLineDash([])
    
    ctx.fillStyle = marker.color || '#ff9800'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(marker.label || ('M' + (marker.id || '')), minX + 4, minY + 4)
  }
  
  _countBoxSelect() {
    if (!this.fallsSelection) return null
    
    const { startX, startY, endX, endY } = this.fallsSelection
    const { waterfallArea } = this
    
    const minX = Math.min(startX, endX) - waterfallArea.x
    const maxX = Math.max(startX, endX) - waterfallArea.x
    const minY = Math.min(startY, endY)
    const maxY = Math.max(startY, endY)
    
    const startFreq = this.getFreqForX(Math.min(startX, endX))
    const endFreq = this.getFreqForX(Math.max(startX, endX))
    
    const lines = this.waterfallData.length
    const startLine = Math.max(0, Math.floor(minY / waterfallArea.height * lines))
    const endLine = Math.min(lines - 1, Math.ceil(maxY / waterfallArea.height * lines))
    
    const selectData = []
    for (let i = startLine; i <= endLine; i++) {
      const line = this.waterfallData[i]
      if (line) {
        const startIdx = Math.max(0, Math.floor((this.config.zoomX[0] + (minX / waterfallArea.width) * (this.config.zoomX[1] - this.config.zoomX[0])) * line.length))
        const endIdx = Math.min(line.length - 1, Math.ceil((this.config.zoomX[0] + (maxX / waterfallArea.width) * (this.config.zoomX[1] - this.config.zoomX[0])) * line.length))
        selectData.push(new Float32Array(line.slice(startIdx, endIdx + 1)))
      }
    }
    
    let maxLevel = -Infinity
    for (const line of selectData) {
      for (let i = 0; i < line.length; i++) {
        if (line[i] > maxLevel) maxLevel = line[i]
      }
    }
    
    return {
      selectStartFreq: startFreq,
      selectEndFreq: endFreq,
      startLine,
      endLine,
      selectData,
      maxLevel,
      pixelRect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
  }
  
  getPlaceForFreq(freq) {
    return this.getXForFreq(freq)
  }
  
  getFreqForX(x) {
    const { plotArea, config } = this
    const ratio = Math.max(0, Math.min(1, (x - plotArea.x) / plotArea.width))
    const zoomedRatio = config.zoomX[0] + ratio * (config.zoomX[1] - config.zoomX[0])
    return config.centerFreq - config.span / 2 + zoomedRatio * config.span
  }
  
  getXForFreq(freq) {
    const { plotArea, config } = this
    const ratio = (freq - (config.centerFreq - config.span / 2)) / config.span
    const zoomedRatio = (ratio - config.zoomX[0]) / (config.zoomX[1] - config.zoomX[0])
    return plotArea.x + Math.max(0, Math.min(1, zoomedRatio)) * plotArea.width
  }
  
  getLevelForY(y) {
    const { plotArea, config } = this
    const ratio = Math.max(0, Math.min(1, (y - plotArea.y) / plotArea.height))
    const zoomedRatio = config.zoomY[0] + ratio * (config.zoomY[1] - config.zoomY[0])
    return config.refLevel - zoomedRatio * (config.refLevel - config.minLevel)
  }
  
  getYForLevel(level) {
    const { plotArea, config } = this
    const ratio = (config.refLevel - level) / (config.refLevel - config.minLevel)
    const zoomedRatio = (ratio - config.zoomY[0]) / (config.zoomY[1] - config.zoomY[0])
    return plotArea.y + Math.max(0, Math.min(1, zoomedRatio)) * plotArea.height
  }
  
  _getDataLevelAtFreq(freq) {
    if (!this.spectrumData || this.spectrumData.length === 0) return this.config.minLevel
    
    const ratio = (freq - (this.config.centerFreq - this.config.span / 2)) / this.config.span
    const idx = Math.floor(ratio * this.spectrumData.length)
    return this.spectrumData[Math.max(0, Math.min(this.spectrumData.length - 1, idx))] || this.config.minLevel
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
  
  addRainMarker(marker) {
    this.rainMarkers.push(marker)
    this._drawRainHand()
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
    if (zoomX) this.config.zoomX = [...zoomX]
    if (zoomY) this.config.zoomY = [...zoomY]
    this.render()
  }
  
  resetZoom() {
    this.config.zoomX = [0, 1]
    this.config.zoomY = [0, 1]
    this.render()
    this._events.emit('zoom', { zoomX: [...this.config.zoomX], zoomY: [...this.config.zoomY] })
  }
  
  pause() {
    this.isPaused = true
    this._events.emit('pause')
  }
  
  play() {
    this.isPaused = false
    this.isPlayingBack = false
    this.playbackData = null
    this.playbackIndex = 0
    this.playLineIndex = -1
    this._stopPlaybackTimer()
    this._drawRainHand()
    this._events.emit('play')
  }
  
  startPlayback(data, onFrame) {
    if (!data || data.length === 0) return
    
    this.isPlayingBack = true
    this.isPaused = true
    this.playbackData = data
    this.playbackIndex = 0
    this._playbackOnFrame = onFrame
    
    this._playbackTick()
    this._events.emit('playbackStart', { total: data.length })
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
          data: frame,
          progress: this.playbackIndex / this.playbackData.length
        })
      }
    }
    
    this.playbackIndex++
    if (this.playbackIndex >= this.playbackData.length) {
      this.playbackIndex = 0
    }
    
    this._playbackTimer = setTimeout(() => this._playbackTick(), this.config.playbackSpeed)
  }
  
  _stopPlaybackTimer() {
    if (this._playbackTimer) {
      clearTimeout(this._playbackTimer)
      this._playbackTimer = null
    }
  }
  
  pausePlayback() {
    if (!this.isPlayingBack) return
    this._stopPlaybackTimer()
    this._events.emit('playbackPause')
  }
  
  resumePlayback() {
    if (!this.isPlayingBack || this._playbackTimer) return
    this._playbackTick()
    this._events.emit('playbackResume')
  }
  
  seekPlayback(frameIndex) {
    if (!this.playbackData) return
    this.playbackIndex = Math.max(0, Math.min(this.playbackData.length - 1, frameIndex))
    const frame = this.playbackData[this.playbackIndex]
    if (frame) {
      this.beginDraw(frame)
      this.playLineIndex = this.playbackIndex
      this._drawRainHand()
    }
  }
  
  stopPlayback() {
    this.isPlayingBack = false
    this._stopPlaybackTimer()
    this.playbackData = null
    this.playbackIndex = 0
    this.playLineIndex = -1
    this._playbackOnFrame = null
    this._drawRainHand()
    this._events.emit('playbackStop')
  }
  
  clearWaterfall() {
    this.waterfallData = []
    this._drawWaterfall()
  }
  
  setConfig(config) {
    Object.assign(this.config, config)
    this.render()
  }
  
  setHoverInfoConfig(config) {
    this.config.hoverInfo = { ...this.config.hoverInfo, ...config }
    this._drawActiveLayer()
  }
  
  render() {
    this._drawBaseLayer()
    this._drawSpectrum()
    
    if (this.config.waterfallVisible) {
      this._drawWaterfall()
      this._drawRainLegend()
    }
    
    this._drawLegend()
    this._drawActiveLayer()
    this._drawRainHand()
  }
  
  resize() {
    this.width = this.container.clientWidth
    this.height = this.container.clientHeight
    
    const { padding, waterfallHeight, waterfallVisible } = this.config
    
    const legendHeight = 24
    const xLabelHeight = 20
    const gap = 10
    const colorBarWidth = 80
    
    const plotTop = padding.top + legendHeight
    const availableHeight = this.height - padding.top - padding.bottom
    const totalExtraHeight = legendHeight + xLabelHeight + (waterfallVisible ? gap + waterfallHeight + xLabelHeight : 0)
    const freqHeight = Math.max(50, availableHeight - totalExtraHeight)
    
    const plotWidth = this.width - padding.left - padding.right - colorBarWidth
    
    this.plotArea = {
      x: padding.left,
      y: plotTop,
      width: plotWidth,
      height: freqHeight
    }
    
    const waterfallTop = plotTop + freqHeight + xLabelHeight + gap
    
    this.waterfallArea = {
      x: padding.left,
      y: waterfallTop,
      width: plotWidth,
      height: waterfallVisible ? waterfallHeight : 0
    }
    
    this._layout = {
      legendHeight,
      xLabelHeight,
      gap,
      colorBarWidth,
      freqDivHeight: waterfallTop + (waterfallVisible ? 0 : xLabelHeight)
    }
    
    const freqCanvasHeight = waterfallTop + (waterfallVisible ? 0 : xLabelHeight)
    const rainCanvasHeight = waterfallVisible ? waterfallHeight + xLabelHeight : 0
    
    if (this.freqDiv) {
      this.freqDiv.style.height = freqCanvasHeight + 'px'
    }
    if (this.rainDiv) {
      this.rainDiv.style.top = waterfallTop + 'px'
      this.rainDiv.style.height = rainCanvasHeight + 'px'
    }
    
    this._resizeAllCanvases(this.width, freqCanvasHeight, rainCanvasHeight)
    
    this.render()
    this._events.emit('resize', { width: this.width, height: this.height })
  }
  
  destroy() {
    if (this._resizeTimer) clearTimeout(this._resizeTimer)
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }
    this._stopPlaybackTimer()
    
    if (this._imageBitmapCache) {
      this._imageBitmapCache.close()
    }
    
    this.spectrumWorker?.terminate()
    this.sampleWorker?.terminate()
    
    this._events.map = {}
    this.container.innerHTML = ''
  }
}
