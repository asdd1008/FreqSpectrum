import { spectrumColors, waterfallColorMap, formatFreq, formatLevel } from '../utils/spectrumUtils.js'

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
    
    this.markers = []
    this.levelIndicator = null
    this.boxSelection = null
    this.timeLine = 0
    this.dpr = 1
    
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.dpr = dpr
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.scale(dpr, dpr)
    this.width = rect.width
    this.height = rect.height
    this.calculateAreas()
  }

  calculateAreas() {
    const { padding, waterfallHeight } = this.options
    const axisLabelHeight = 25
    
    this.plotArea = {
      x: padding.left,
      y: padding.top,
      width: this.width - padding.left - padding.right,
      height: this.height - padding.top - padding.bottom - waterfallHeight - axisLabelHeight * 2
    }
    
    this.waterfallArea = {
      x: padding.left,
      y: this.height - padding.bottom - waterfallHeight - axisLabelHeight,
      width: this.width - padding.left - padding.right,
      height: waterfallHeight
    }
  }

  setConfig(config) {
    if (config.centerFreq !== undefined) this.centerFreq = config.centerFreq
    if (config.span !== undefined) this.span = config.span
    if (config.refLevel !== undefined) {
      this.refLevel = config.refLevel
      this.maxLevel = config.refLevel
      this.minLevel = config.refLevel - 100
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

  setTimeLine(time) {
    this.timeLine = time
  }

  render() {
    this.clear()
    this.drawBackground()
    this.drawGrid()
    this.drawAxis()
    
    if (this.waterfallData.length > 0) {
      this.drawWaterfall()
    }
    
    this.drawSpectrum()
    
    if (this.maxHoldData) this.drawMaxHold()
    if (this.minHoldData) this.drawMinHold()
    if (this.avgData) this.drawAvg()
    
    this.drawMarkers()
    this.drawLevelIndicator()
    this.drawBoxSelection()
    this.drawTimeLine()
    this.drawLegend()
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  drawBackground() {
    this.ctx.fillStyle = spectrumColors.background
    this.ctx.fillRect(this.plotArea.x, this.plotArea.y, this.plotArea.width, this.plotArea.height)
    this.ctx.fillRect(this.waterfallArea.x, this.waterfallArea.y, this.waterfallArea.width, this.waterfallArea.height)
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
    
    const labelCountX = 5
    for (let i = 0; i <= labelCountX; i++) {
      const ratio = i / labelCountX
      const x = this.plotArea.x + this.plotArea.width * ratio
      const freq = this.centerFreq - this.span / 2 + this.span * ratio
      this.ctx.fillText(formatFreq(freq), x, this.plotArea.y + this.plotArea.height + 5)
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
    
    this.ctx.strokeRect(this.waterfallArea.x, this.waterfallArea.y, this.waterfallArea.width, this.waterfallArea.height)
    
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'top'
    for (let i = 0; i <= labelCountX; i++) {
      const ratio = i / labelCountX
      const x = this.waterfallArea.x + this.waterfallArea.width * ratio
      const freq = this.centerFreq - this.span / 2 + this.span * ratio
      this.ctx.fillText(formatFreq(freq), x, this.waterfallArea.y + this.waterfallArea.height + 5)
    }
    
    this.ctx.textAlign = 'right'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText('时间', this.waterfallArea.x - 5, this.waterfallArea.y + this.waterfallArea.height / 2)
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

  drawBoxSelection() {
    if (!this.boxSelection) return
    
    const { startX, startY, endX, endY } = this.boxSelection
    
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const width = Math.abs(endX - startX)
    const height = Math.abs(endY - startY)
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([5, 5])
    this.ctx.strokeRect(x, y, width, height)
    this.ctx.setLineDash([])
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
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
    
    // 瀑布图颜色条图例
    this.drawWaterfallColorBar()
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
