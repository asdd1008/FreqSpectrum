import { spectrumColors, waterfallColorMap, formatFreq, formatLevel } from '../utils/spectrumUtils.js'

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    this.beginPath()
    this.moveTo(x + r, y)
    this.arcTo(x + w, y, x + w, y + h, r)
    this.arcTo(x + w, y + h, x, y + h, r)
    this.arcTo(x, y + h, x, y, r)
    this.arcTo(x, y, x + w, y, r)
    this.closePath()
    return this
  }
}

export class SpectrumCanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.options = {
      padding: { top: 20, right: 60, bottom: 40, left: 60 },
      waterfallHeight: 200,
      showGrid: true,
      showAxis: true,
      showLegend: true,
      ...options
    }
    
    this.spectrumData = null
    this.maxHoldData = null
    this.minHoldData = null
    this.avgData = null
    this.waterfallData = []
    
    this.centerFreq = 1000000000
    this.span = 100000000
    this.refLevel = 0
    this.minLevel = -100
    this.maxLevel = 0
    
    this.baseCenterFreq = 1000000000
    this.baseSpan = 100000000
    this.baseRefLevel = 0
    this.baseMinLevel = -100
    this.baseMaxLevel = 0
    
    this.markers = []
    this.levelIndicator = null
    this.boxSelection = null
    this.timeLine = 0
    this.dpr = 1
    
    this.zoomX = 1
    this.zoomY = 1
    this.panX = 0
    this.panY = 0
    
    this.highlightedSignals = []
    this.rightBoxSelection = null
    
    this.mousePosition = null
    
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.dpr = dpr
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.width = rect.width
    this.height = rect.height
    this.calculateAreas()
  }

  calculateAreas() {
    const { padding, waterfallHeight } = this.options
    const hasWaterfall = waterfallHeight > 0
    const axisLabelHeight = 25
    
    if (hasWaterfall) {
      // 瀑布图显示时：频谱图和瀑布图各占50%
      const totalUsableHeight = this.height - padding.top - padding.bottom
      const spectrumHeight = totalUsableHeight * 0.5
      const waterfallAreaHeight = totalUsableHeight * 0.5
      
      this.plotArea = {
        x: padding.left,
        y: padding.top,
        width: this.width - padding.left - padding.right,
        height: spectrumHeight - axisLabelHeight
      }
      
      this.waterfallArea = {
        x: padding.left,
        y: padding.top + spectrumHeight + axisLabelHeight,
        width: this.width - padding.left - padding.right,
        height: waterfallAreaHeight - axisLabelHeight
      }
    } else {
      // 瀑布图隐藏时：频谱图占全部高度，不绘制瀑布图区域
      this.plotArea = {
        x: padding.left,
        y: padding.top,
        width: this.width - padding.left - padding.right,
        height: this.height - padding.top - padding.bottom
      }
      
      this.waterfallArea = {
        x: padding.left,
        y: this.height,
        width: this.width - padding.left - padding.right,
        height: 0
      }
    }
  }

  setConfig(config) {
    if (config.centerFreq !== undefined) {
      this.centerFreq = config.centerFreq
      this.baseCenterFreq = config.centerFreq
    }
    if (config.span !== undefined) {
      this.span = config.span
      this.baseSpan = config.span
    }
    if (config.refLevel !== undefined) {
      this.refLevel = config.refLevel
      this.baseRefLevel = config.refLevel
      this.maxLevel = config.refLevel
      this.baseMaxLevel = config.refLevel
      this.minLevel = config.refLevel - 100
      this.baseMinLevel = config.refLevel - 100
    }
    if (config.waterfallHeight !== undefined) {
      this.options.waterfallHeight = config.waterfallHeight
      this.calculateAreas()
    }
  }

  setData(data) {
    if (data.spectrum) this.spectrumData = data.spectrum
    if (data.maxHold) this.maxHoldData = data.maxHold
    if (data.minHold) this.minHoldData = data.minHold
    if (data.avg) this.avgData = data.avg
    if (data.waterfall) this.waterfallData = data.waterfall
  }

  addWaterfallLine(data) {
    if (!data || data.length === 0) return
    this.waterfallData.push(Array.from(data))
    const maxLines = 200
    if (this.waterfallData.length > maxLines) {
      this.waterfallData = this.waterfallData.slice(-maxLines)
    }
  }

  clearWaterfall() {
    this.waterfallData = []
  }

  isInPlotArea(x, y) {
    return x >= this.plotArea.x && x <= this.plotArea.x + this.plotArea.width &&
           y >= this.plotArea.y && y <= this.plotArea.y + this.plotArea.height
  }

  addMarker(marker) {
    this.markers.push({
      id: Date.now(),
      ...marker
    })
  }

  removeMarker(id) {
    this.markers = this.markers.filter(m => m.id !== id)
  }

  clearMarkers() {
    this.markers = []
  }

  setLevelIndicator(position) {
    this.levelIndicator = position
  }

  setBoxSelection(selection) {
    this.boxSelection = selection
  }

  setRightBoxSelection(selection) {
    this.rightBoxSelection = selection
  }

  setMousePosition(pos) {
    this.mousePosition = pos
  }

  setTimeLine(time) {
    this.timeLine = time
  }

  zoomAt(x, y, factorX, factorY) {
    const plotX = x - this.plotArea.x
    const plotY = y - this.plotArea.y
    
    if (plotX < 0 || plotX > this.plotArea.width || plotY < 0 || plotY > this.plotArea.height) {
      return
    }
    
    const xRatio = plotX / this.plotArea.width
    const yRatio = plotY / this.plotArea.height
    
    const freqAtMouse = this.centerFreq - this.span / 2 + this.span * xRatio
    const levelAtMouse = this.maxLevel - (this.maxLevel - this.minLevel) * yRatio
    
    const newZoomX = Math.max(0.1, Math.min(20, this.zoomX * factorX))
    const newZoomY = Math.max(0.1, Math.min(20, this.zoomY * factorY))
    
    const newSpan = this.baseSpan / newZoomX
    const newLevelRange = (this.baseMaxLevel - this.baseMinLevel) / newZoomY
    
    const newCenterFreq = freqAtMouse + (0.5 - xRatio) * newSpan
    const newMaxLevel = levelAtMouse + yRatio * newLevelRange
    const newMinLevel = newMaxLevel - newLevelRange
    
    this.zoomX = newZoomX
    this.zoomY = newZoomY
    this.centerFreq = newCenterFreq
    this.span = newSpan
    this.minLevel = newMinLevel
    this.maxLevel = newMaxLevel
  }

  resetZoom() {
    this.zoomX = 1
    this.zoomY = 1
    this.panX = 0
    this.panY = 0
    this.centerFreq = this.baseCenterFreq
    this.span = this.baseSpan
    this.refLevel = this.baseRefLevel
    this.minLevel = this.baseMinLevel
    this.maxLevel = this.baseMaxLevel
  }

  addHighlightedSignal(signal) {
    const existing = this.highlightedSignals.find(s => s.freq === signal.freq && s.bandwidth === signal.bandwidth)
    if (!existing) {
      this.highlightedSignals.push({
        id: signal.id || Date.now(),
        freq: signal.freq,
        bandwidth: signal.bandwidth,
        maxLevel: signal.maxLevel,
        color: signal.color || '#00ff88',
        ...signal
      })
    }
  }

  removeHighlightedSignal(id) {
    this.highlightedSignals = this.highlightedSignals.filter(s => s.id !== id)
  }

  clearHighlightedSignals() {
    this.highlightedSignals = []
  }

  getHoverData(x, y) {
    const freq = this.getFreqAtX(x)
    const level = this.getLevelAtY(y)
    
    if (freq === null || level === null) return null
    
    const points = this.spectrumData?.length || 1
    const index = Math.round(((x - this.plotArea.x) / this.plotArea.width) * (points - 1))
    const clampedIndex = Math.max(0, Math.min(points - 1, index))
    const actualLevel = this.spectrumData?.[clampedIndex] || this.minLevel
    
    const nearbyData = []
    const searchRadius = Math.floor(points * 0.05)
    for (let i = Math.max(0, clampedIndex - searchRadius); i <= Math.min(points - 1, clampedIndex + searchRadius); i++) {
      const px = this.plotArea.x + (this.plotArea.width / (points - 1)) * i
      const pl = this.spectrumData?.[i] || this.minLevel
      nearbyData.push({ x: px, level: pl })
    }
    
    const maxNearby = Math.max(...nearbyData.map(d => d.level))
    const maxIndex = nearbyData.findIndex(d => d.level === maxNearby) + Math.max(0, clampedIndex - searchRadius)
    const maxFreq = this.centerFreq - this.span / 2 + (maxIndex / (points - 1)) * this.span
    
    return {
      freq,
      level: actualLevel,
      maxLevel: maxNearby,
      maxFreq,
      bandwidth: this.span / points,
      index: clampedIndex
    }
  }

  render() {
    this.clear()
    this.drawBackground()
    this.drawGrid()
    this.drawAxis()
    
    if (this.waterfallArea.height > 0 && this.waterfallData.length > 0) {
      this.drawWaterfall()
    }
    
    this.drawSpectrum()
    
    if (this.maxHoldData) this.drawMaxHold()
    if (this.minHoldData) this.drawMinHold()
    if (this.avgData) this.drawAvg()
    
    this.drawHighlightedSignals()
    this.drawMarkers()
    this.drawLevelIndicator()
    this.drawCrosshairs()
    this.drawBoxSelection()
    this.drawRightBoxSelection()
    this.drawTimeLine()
    this.drawLegend()
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  drawBackground() {
    this.ctx.fillStyle = spectrumColors.background
    this.ctx.fillRect(this.plotArea.x, this.plotArea.y, this.plotArea.width, this.plotArea.height)
    if (this.waterfallArea.height > 0) {
      this.ctx.fillRect(this.waterfallArea.x, this.waterfallArea.y, this.waterfallArea.width, this.waterfallArea.height)
    }
  }

  drawGrid() {
    if (!this.options.showGrid) return
    
    this.ctx.strokeStyle = spectrumColors.grid
    this.ctx.lineWidth = 0.5
    
    const gridCountX = 10
    const gridCountY = 10
    
    for (let i = 0; i <= gridCountX; i++) {
      const x = this.plotArea.x + (this.plotArea.width / gridCountX) * i
      this.ctx.beginPath()
      this.ctx.moveTo(x, this.plotArea.y)
      this.ctx.lineTo(x, this.plotArea.y + this.plotArea.height)
      this.ctx.stroke()
    }
    
    for (let i = 0; i <= gridCountY; i++) {
      const y = this.plotArea.y + (this.plotArea.height / gridCountY) * i
      this.ctx.beginPath()
      this.ctx.moveTo(this.plotArea.x, y)
      this.ctx.lineTo(this.plotArea.x + this.plotArea.width, y)
      this.ctx.stroke()
    }
  }

  drawAxis() {
    if (!this.options.showAxis) return
    
    this.ctx.strokeStyle = spectrumColors.axis
    this.ctx.lineWidth = 1
    this.ctx.fillStyle = spectrumColors.text
    this.ctx.font = '11px monospace'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'top'
    
    this.ctx.strokeRect(this.plotArea.x, this.plotArea.y, this.plotArea.width, this.plotArea.height)
    
    const labelCountX = this.getOptimalLabelCountX()
    const freqFormatter = this.getFreqFormatter()
    for (let i = 0; i <= labelCountX; i++) {
      const ratio = i / labelCountX
      const x = this.plotArea.x + this.plotArea.width * ratio
      const freq = this.centerFreq - this.span / 2 + this.span * ratio
      this.ctx.fillText(freqFormatter(freq), x, this.plotArea.y + this.plotArea.height + 5)
    }
    
    this.ctx.textAlign = 'right'
    this.ctx.textBaseline = 'middle'
    const labelCountY = 5
    for (let i = 0; i <= labelCountY; i++) {
      const ratio = i / labelCountY
      const y = this.plotArea.y + this.plotArea.height * ratio
      const level = this.maxLevel - (this.maxLevel - this.minLevel) * ratio
      this.ctx.fillText(level.toFixed(0) + ' dBm', this.plotArea.x - 5, y)
    }
    
    // 只在瀑布图显示时绘制瀑布图轴
    if (this.waterfallArea.height > 0) {
      this.ctx.strokeRect(this.waterfallArea.x, this.waterfallArea.y, this.waterfallArea.width, this.waterfallArea.height)
      
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'top'
      for (let i = 0; i <= labelCountX; i++) {
        const ratio = i / labelCountX
        const x = this.waterfallArea.x + this.waterfallArea.width * ratio
        const freq = this.centerFreq - this.span / 2 + this.span * ratio
        this.ctx.fillText(freqFormatter(freq), x, this.waterfallArea.y + this.waterfallArea.height + 5)
      }
      
      this.ctx.textAlign = 'right'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText('时间', this.waterfallArea.x - 5, this.waterfallArea.y + this.waterfallArea.height / 2)
    }
  }

  getOptimalLabelCountX() {
    const minLabelWidth = 80
    const maxLabels = Math.floor(this.plotArea.width / minLabelWidth)
    const niceNumbers = [2, 3, 4, 5, 6, 8, 10]
    for (let i = niceNumbers.length - 1; i >= 0; i--) {
      if (niceNumbers[i] <= maxLabels) {
        return niceNumbers[i]
      }
    }
    return 2
  }

  getFreqFormatter() {
    const span = this.span
    if (span >= 1e9) {
      return (f) => (f / 1e9).toFixed(3) + ' GHz'
    } else if (span >= 1e8) {
      return (f) => (f / 1e6).toFixed(1) + ' MHz'
    } else if (span >= 1e7) {
      return (f) => (f / 1e6).toFixed(2) + ' MHz'
    } else if (span >= 1e6) {
      return (f) => (f / 1e6).toFixed(3) + ' MHz'
    } else if (span >= 1e5) {
      return (f) => (f / 1e3).toFixed(1) + ' kHz'
    } else if (span >= 1e4) {
      return (f) => (f / 1e3).toFixed(2) + ' kHz'
    } else {
      return (f) => (f / 1e3).toFixed(3) + ' kHz'
    }
  }

  drawSpectrum() {
    if (!this.spectrumData || this.spectrumData.length === 0) return
    
    this.ctx.strokeStyle = spectrumColors.spectrum
    this.ctx.lineWidth = 1.5
    this.ctx.beginPath()
    
    const points = this.spectrumData.length
    for (let i = 0; i < points; i++) {
      const x = this.plotArea.x + (this.plotArea.width / (points - 1)) * i
      const level = this.spectrumData[i]
      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))
      
      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        this.ctx.lineTo(x, y)
      }
    }
    this.ctx.stroke()
  }

  drawMaxHold() {
    if (!this.maxHoldData || this.maxHoldData.length === 0) return
    
    this.ctx.strokeStyle = spectrumColors.maxHold
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([5, 3])
    this.ctx.beginPath()
    
    const points = this.maxHoldData.length
    for (let i = 0; i < points; i++) {
      const x = this.plotArea.x + (this.plotArea.width / (points - 1)) * i
      const level = this.maxHoldData[i]
      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))
      
      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        this.ctx.lineTo(x, y)
      }
    }
    this.ctx.stroke()
    this.ctx.setLineDash([])
  }

  drawMinHold() {
    if (!this.minHoldData || this.minHoldData.length === 0) return
    
    this.ctx.strokeStyle = spectrumColors.minHold
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([3, 3])
    this.ctx.beginPath()
    
    const points = this.minHoldData.length
    for (let i = 0; i < points; i++) {
      const x = this.plotArea.x + (this.plotArea.width / (points - 1)) * i
      const level = this.minHoldData[i]
      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))
      
      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        this.ctx.lineTo(x, y)
      }
    }
    this.ctx.stroke()
    this.ctx.setLineDash([])
  }

  drawAvg() {
    if (!this.avgData || this.avgData.length === 0) return
    
    this.ctx.strokeStyle = spectrumColors.avgHold
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([2, 2])
    this.ctx.beginPath()
    
    const points = this.avgData.length
    for (let i = 0; i < points; i++) {
      const x = this.plotArea.x + (this.plotArea.width / (points - 1)) * i
      const level = this.avgData[i]
      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))
      
      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        this.ctx.lineTo(x, y)
      }
    }
    this.ctx.stroke()
    this.ctx.setLineDash([])
  }

  drawWaterfall() {
    if (!this.waterfallData || this.waterfallData.length === 0) return
    
    const w = Math.floor(this.waterfallArea.width * this.dpr)
    const h = Math.floor(this.waterfallArea.height * this.dpr)
    const x = Math.floor(this.waterfallArea.x * this.dpr)
    const y = Math.floor(this.waterfallArea.y * this.dpr)
    
    const imageData = this.ctx.createImageData(w, h)
    const data = imageData.data
    
    const lineHeight = h / Math.max(1, this.waterfallData.length)
    const points = this.waterfallData[0]?.length || 1
    
    for (let py = 0; py < h; py++) {
      const lineIndex = Math.min(this.waterfallData.length - 1, Math.floor(py / lineHeight))
      const lineData = this.waterfallData[lineIndex]
      
      if (!lineData) continue
      
      for (let px = 0; px < w; px++) {
        const pointIndex = Math.min(points - 1, Math.floor((px / w) * points))
        const value = lineData[pointIndex]
        
        const color = this.getWaterfallColor(value)
        const idx = (py * w + px) * 4
        
        data[idx] = color.r
        data[idx + 1] = color.g
        data[idx + 2] = color.b
        data[idx + 3] = 255
      }
    }
    
    this.ctx.putImageData(imageData, x, y)
  }

  getWaterfallColor(value) {
    const ratio = (value - this.minLevel) / (this.maxLevel - this.minLevel)
    const clamped = Math.max(0, Math.min(1, ratio))
    
    let r, g, b
    
    if (clamped < 0.25) {
      const t = clamped / 0.25
      r = 0
      g = 0
      b = Math.floor(t * 255)
    } else if (clamped < 0.5) {
      const t = (clamped - 0.25) / 0.25
      r = 0
      g = Math.floor(t * 255)
      b = 255
    } else if (clamped < 0.75) {
      const t = (clamped - 0.5) / 0.25
      r = Math.floor(t * 255)
      g = 255
      b = Math.floor(255 * (1 - t))
    } else {
      const t = (clamped - 0.75) / 0.25
      r = 255
      g = Math.floor(255 * (1 - t))
      b = 0
    }
    
    return { r, g, b }
  }

  drawHighlightedSignals() {
    this.highlightedSignals.forEach(signal => {
      const points = this.spectrumData?.length || 1
      const freqStart = signal.freq - signal.bandwidth / 2
      const freqEnd = signal.freq + signal.bandwidth / 2
      
      const ratioStart = (freqStart - (this.centerFreq - this.span / 2)) / this.span
      const ratioEnd = (freqEnd - (this.centerFreq - this.span / 2)) / this.span
      
      const xStart = this.plotArea.x + this.plotArea.width * ratioStart
      const xEnd = this.plotArea.x + this.plotArea.width * ratioEnd
      
      if (xEnd < this.plotArea.x || xStart > this.plotArea.x + this.plotArea.width) return
      
      const levelRatio = (signal.maxLevel - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, levelRatio)))
      
      this.ctx.fillStyle = `${signal.color}20`
      this.ctx.fillRect(xStart, this.plotArea.y, xEnd - xStart, this.plotArea.height)
      
      this.ctx.strokeStyle = signal.color
      this.ctx.lineWidth = 2
      this.ctx.setLineDash([6, 3])
      this.ctx.strokeRect(xStart, this.plotArea.y, xEnd - xStart, this.plotArea.height)
      this.ctx.setLineDash([])
      
      this.ctx.fillStyle = signal.color
      this.ctx.beginPath()
      this.ctx.moveTo(xStart, y)
      this.ctx.lineTo(xEnd, y)
      this.ctx.stroke()
      
      this.ctx.fillStyle = '#fff'
      this.ctx.font = 'bold 10px monospace'
      this.ctx.textAlign = 'center'
      this.ctx.textBaseline = 'bottom'
      const label = `${(signal.maxLevel || 0).toFixed(1)} dBm`
      this.ctx.fillText(label, (xStart + xEnd) / 2, y - 5)
    })
  }

  drawMarkers() {
    this.markers.forEach(marker => {
      const points = this.spectrumData?.length || 1
      const x = this.plotArea.x + (this.plotArea.width / (points - 1)) * marker.index
      
      let level = this.spectrumData?.[marker.index] || this.minLevel
      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))
      
      this.ctx.strokeStyle = spectrumColors.marker
      this.ctx.lineWidth = 1
      this.ctx.setLineDash([4, 2])
      
      this.ctx.beginPath()
      this.ctx.moveTo(x, this.plotArea.y)
      this.ctx.lineTo(x, this.plotArea.y + this.plotArea.height)
      this.ctx.stroke()
      
      this.ctx.setLineDash([])
      
      this.ctx.fillStyle = spectrumColors.marker
      this.ctx.beginPath()
      this.ctx.arc(x, y, 5, 0, Math.PI * 2)
      this.ctx.fill()
      
      this.ctx.fillStyle = '#000'
      this.ctx.font = '10px monospace'
      this.ctx.textAlign = 'left'
      this.ctx.textBaseline = 'bottom'
      const label = `M${marker.id}: ${level.toFixed(2)} dBm`
      this.ctx.fillText(label, x + 8, y - 5)
    })
  }

  drawLevelIndicator() {
    if (!this.levelIndicator) return
    
    const { x, y } = this.levelIndicator
    
    if (x >= this.plotArea.x && x <= this.plotArea.x + this.plotArea.width &&
        y >= this.plotArea.y && y <= this.plotArea.y + this.plotArea.height) {
      
      const points = this.spectrumData?.length || 1
      const index = Math.round(((x - this.plotArea.x) / this.plotArea.width) * (points - 1))
      const clampedIndex = Math.max(0, Math.min(points - 1, index))
      const level = this.spectrumData?.[clampedIndex] || this.minLevel
      const freq = this.centerFreq - this.span / 2 + (clampedIndex / (points - 1)) * this.span
      
      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const plotY = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))
      
      this.ctx.strokeStyle = spectrumColors.levelIndicator
      this.ctx.lineWidth = 2
      this.ctx.beginPath()
      this.ctx.moveTo(this.plotArea.x, plotY)
      this.ctx.lineTo(this.plotArea.x + this.plotArea.width, plotY)
      this.ctx.stroke()
      
      this.ctx.fillStyle = spectrumColors.levelIndicator
      this.ctx.beginPath()
      this.ctx.arc(x, plotY, 6, 0, Math.PI * 2)
      this.ctx.fill()
      
      this.ctx.fillStyle = spectrumColors.levelIndicator
      this.ctx.fillRect(this.plotArea.x + this.plotArea.width + 5, plotY - 10, 50, 20)
      this.ctx.fillStyle = '#fff'
      this.ctx.font = '10px monospace'
      this.ctx.textAlign = 'left'
      this.ctx.textBaseline = 'middle'
      this.ctx.fillText(level.toFixed(1), this.plotArea.x + this.plotArea.width + 8, plotY)
      
      this.levelIndicator.freq = freq
      this.levelIndicator.level = level
    }
  }

  drawCrosshairs() {
    if (!this.mousePosition) return
    
    const { x, y } = this.mousePosition
    
    if (x < this.plotArea.x || x > this.plotArea.x + this.plotArea.width ||
        y < this.plotArea.y || y > this.plotArea.y + this.plotArea.height) {
      return
    }
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    this.ctx.lineWidth = 0.5
    this.ctx.setLineDash([4, 4])
    
    this.ctx.beginPath()
    this.ctx.moveTo(x, this.plotArea.y)
    this.ctx.lineTo(x, this.plotArea.y + this.plotArea.height)
    this.ctx.stroke()
    
    this.ctx.beginPath()
    this.ctx.moveTo(this.plotArea.x, y)
    this.ctx.lineTo(this.plotArea.x + this.plotArea.width, y)
    this.ctx.stroke()
    
    this.ctx.setLineDash([])
    
    const freq = this.getFreqAtX(x)
    const level = this.getLevelAtY(y)
    
    const points = this.spectrumData?.length || 1
    const index = Math.round(((x - this.plotArea.x) / this.plotArea.width) * (points - 1))
    const clampedIndex = Math.max(0, Math.min(points - 1, index))
    const actualLevel = this.spectrumData?.[clampedIndex] || this.minLevel
    
    const skyFreq = (freq / 1e6).toFixed(3)
    const accessFreq = ((freq - 10700000) / 1e6).toFixed(3)
    
    const textX = this.plotArea.x + 10
    const textY = this.plotArea.y + this.plotArea.height + 5
    
    this.ctx.fillStyle = '#66b2ff'
    this.ctx.font = '11px monospace'
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'top'
    
    this.ctx.fillText(`${actualLevel.toFixed(2)} dBm    天空频率: ${skyFreq} MHz    接入频率: ${accessFreq} MHz`, textX, textY)
  }

  drawBoxSelection() {
    if (!this.boxSelection) return
    
    const { startX, startY, endX, endY } = this.boxSelection
    
    const x = Math.min(startX, endX)
    const width = Math.abs(endX - startX)
    
    const fillY = this.plotArea.y
    const fillHeight = this.plotArea.height
    
    this.ctx.strokeStyle = '#801E17'
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([6, 3])
    this.ctx.strokeRect(x, fillY, width, fillHeight)
    this.ctx.setLineDash([])
    
    this.ctx.fillStyle = 'rgba(128, 30, 23, 0.3)'
    this.ctx.fillRect(x, fillY, width, fillHeight)
  }

  drawRightBoxSelection() {
    if (!this.rightBoxSelection) return
    
    const { startX, startY, endX, endY } = this.rightBoxSelection
    
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const width = Math.abs(endX - startX)
    const height = Math.abs(endY - startY)
    
    this.ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)'
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([8, 4])
    this.ctx.strokeRect(x, y, width, height)
    this.ctx.setLineDash([])
    
    this.ctx.fillStyle = 'rgba(255, 165, 0, 0.15)'
    this.ctx.fillRect(x, y, width, height)
  }

  drawTimeLine() {
    if (!this.timeLine || this.waterfallData.length === 0) return
    
    const lineHeight = this.waterfallArea.height / this.waterfallData.length
    const y = this.waterfallArea.y + this.timeLine * lineHeight
    
    this.ctx.strokeStyle = '#ffeb3b'
    this.ctx.lineWidth = 2
    this.ctx.beginPath()
    this.ctx.moveTo(this.waterfallArea.x, y)
    this.ctx.lineTo(this.waterfallArea.x + this.waterfallArea.width, y)
    this.ctx.stroke()
  }

  drawLegend() {
    if (!this.options.showLegend) return
    
    // 频谱图图例
    const legends = []
    legends.push({ color: spectrumColors.spectrum, label: '实时频谱' })
    if (this.maxHoldData) legends.push({ color: spectrumColors.maxHold, label: '最大保持' })
    if (this.minHoldData) legends.push({ color: spectrumColors.minHold, label: '最小保持' })
    if (this.avgData) legends.push({ color: spectrumColors.avgHold, label: '平均' })
    
    let x = this.plotArea.x + 10
    const y = this.plotArea.y + 10
    
    this.ctx.font = '11px sans-serif'
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'top'
    
    legends.forEach((legend, i) => {
      const offsetX = i * 100
      
      // 绘制图例色块（带边框）
      this.ctx.fillStyle = legend.color
      this.ctx.fillRect(x + offsetX, y, 14, 14)
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      this.ctx.lineWidth = 1
      this.ctx.strokeRect(x + offsetX, y, 14, 14)
      
      this.ctx.fillStyle = spectrumColors.text
      this.ctx.fillText(legend.label, x + offsetX + 20, y + 2)
    })
    
    // 瀑布图颜色条图例（仅在瀑布图显示时绘制）
    if (this.waterfallArea.height > 0) {
      this.drawWaterfallColorBar()
    }
  }
  
  drawWaterfallColorBar() {
    const barWidth = 15
    const barHeight = this.waterfallArea.height
    const barX = this.waterfallArea.x + this.waterfallArea.width + 10
    const barY = this.waterfallArea.y
    
    // 绘制颜色条背景边框
    this.ctx.strokeStyle = spectrumColors.axis
    this.ctx.lineWidth = 1
    this.ctx.strokeRect(barX, barY, barWidth, barHeight)
    
    // 绘制颜色条渐变
    for (let i = 0; i < barHeight; i++) {
      const ratio = 1 - i / barHeight
      const value = this.minLevel + (this.maxLevel - this.minLevel) * ratio
      const color = this.getWaterfallColor(value)
      
      this.ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      this.ctx.fillRect(barX + 1, barY + i, barWidth - 2, 1)
    }
    
    // 绘制颜色条刻度标签
    this.ctx.fillStyle = spectrumColors.text
    this.ctx.font = '10px monospace'
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'middle'
    
    // 最大值标签（顶部）
    this.ctx.fillText(`${this.maxLevel} dBm`, barX + barWidth + 5, barY + 5)
    
    // 中间值标签
    const midLevel = (this.maxLevel + this.minLevel) / 2
    this.ctx.fillText(`${midLevel.toFixed(0)} dBm`, barX + barWidth + 5, barY + barHeight / 2)
    
    // 最小值标签（底部）
    this.ctx.fillText(`${this.minLevel} dBm`, barX + barWidth + 5, barY + barHeight - 5)
  }

  getFreqAtX(x) {
    if (x < this.plotArea.x || x > this.plotArea.x + this.plotArea.width) return null
    const ratio = (x - this.plotArea.x) / this.plotArea.width
    return this.centerFreq - this.span / 2 + this.span * ratio
  }

  getLevelAtY(y) {
    if (y < this.plotArea.y || y > this.plotArea.y + this.plotArea.height) return null
    const ratio = (y - this.plotArea.y) / this.plotArea.height
    return this.maxLevel - (this.maxLevel - this.minLevel) * ratio
  }

  getIndexAtX(x, points) {
    if (x < this.plotArea.x || x > this.plotArea.x + this.plotArea.width) return -1
    const ratio = (x - this.plotArea.x) / this.plotArea.width
    return Math.round(ratio * (points - 1))
  }

  isInWaterfall(x, y) {
    return x >= this.waterfallArea.x && x <= this.waterfallArea.x + this.waterfallArea.width &&
           y >= this.waterfallArea.y && y <= this.waterfallArea.y + this.waterfallArea.height
  }

  getWaterfallPos(x, y) {
    if (!this.isInWaterfall(x, y)) return null
    
    const points = this.waterfallData[0]?.length || 1
    const lineHeight = this.waterfallArea.height / Math.max(1, this.waterfallData.length)
    
    const xRatio = (x - this.waterfallArea.x) / this.waterfallArea.width
    const indexX = Math.round(xRatio * (points - 1))
    const indexY = Math.floor((y - this.waterfallArea.y) / lineHeight)
    
    return { indexX, indexY }
  }

  takeSnapshot() {
    return this.canvas.toDataURL('image/png')
  }
}

export default SpectrumCanvasRenderer
