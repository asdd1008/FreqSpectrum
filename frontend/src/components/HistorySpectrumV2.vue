<template>
  <div class="history-spectrum-v2-container" ref="containerRef">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-button size="small" type="primary" @click="resetView">重置视图</el-button>
        <el-button size="small" @click="zoomIn">放大</el-button>
        <el-button size="small" @click="zoomOut">缩小</el-button>
        <span class="level-info">层级: {{ currentLevel }} / {{ MAX_LEVEL }}</span>
      </div>
      <div class="toolbar-right">
        <span v-if="hoverInfo.visible" class="hover-info">
          频率: {{ formatFreq(hoverInfo.freq) }} | 
          dBm: {{ hoverInfo.level?.toFixed(1) ?? '--' }}
        </span>
      </div>
    </div>

    <!-- 频谱图区域 -->
    <div class="spectrum-area" ref="spectrumAreaRef">
      <canvas 
        ref="spectrumCanvasRef" 
        class="spectrum-canvas"
        @mousedown="onSpectrumMouseDown"
        @mousemove="onSpectrumMouseMove"
        @mouseup="onSpectrumMouseUp"
        @mouseleave="onSpectrumMouseLeave"
        @wheel="onSpectrumWheel"
      ></canvas>
      <div v-if="tooltip.visible && !isSpectrumBoxSelecting" class="tooltip" :style="tooltipStyle">
        <div>频率: {{ formatFreq(tooltip.freq) }}</div>
        <div>功率: {{ tooltip.level?.toFixed(1) ?? '--' }} dBm</div>
      </div>
      <div v-if="isSpectrumBoxSelecting || spectrumBoxSelectionPersist" class="box-selection" :style="spectrumBoxSelectionStyle"></div>
      <div v-if="spectrumBoxSelectionInfo.visible" class="box-selection-info">
        <div>频率范围: {{ formatFreq(spectrumBoxSelectionInfo.freqStart) }} - {{ formatFreq(spectrumBoxSelectionInfo.freqEnd) }}</div>
        <div>中心频率: {{ formatFreq(spectrumBoxSelectionInfo.centerFreq) }}</div>
        <div>带宽: {{ formatFreq(spectrumBoxSelectionInfo.bandwidth) }}</div>
        <div class="info-actions">
          <el-button size="small" type="primary" @click="applySpectrumBoxSelection">应用</el-button>
          <el-button size="small" @click="cancelSpectrumBoxSelection">取消</el-button>
        </div>
      </div>
    </div>

    <!-- 瀑布图区域 -->
    <div class="waterfall-area" ref="waterfallAreaRef">
      <canvas 
        ref="waterfallCanvasRef" 
        class="waterfall-canvas"
        @mousedown="onWaterfallMouseDown"
        @mousemove="onWaterfallMouseMove"
        @mouseup="onWaterfallMouseUp"
        @mouseleave="onWaterfallMouseUp"
        @wheel="onWaterfallWheel"
      ></canvas>
      <div v-if="isWaterfallBoxSelecting || waterfallBoxSelectionPersist" class="waterfall-box-selection" :style="waterfallBoxSelectionStyle"></div>
      <div v-if="waterfallBoxSelectionInfo.visible" class="box-selection-info waterfall-selection-info">
        <div>频率范围: {{ formatFreq(waterfallBoxSelectionInfo.freqStart) }} - {{ formatFreq(waterfallBoxSelectionInfo.freqEnd) }}</div>
        <div>时间范围: {{ formatTime(waterfallBoxSelectionInfo.timeStart) }} - {{ formatTime(waterfallBoxSelectionInfo.timeEnd) }}</div>
        <div class="info-actions">
          <el-button size="small" type="primary" @click="applyWaterfallBoxSelection">应用</el-button>
          <el-button size="small" @click="cancelWaterfallBoxSelection">取消</el-button>
        </div>
      </div>
      <!-- 右侧颜色柱 -->
      <div class="color-bar">
        <canvas ref="colorBarCanvasRef" class="color-bar-canvas"></canvas>
        <div class="color-bar-labels">
          <span>0</span>
          <span>-25</span>
          <span>-50</span>
          <span>-75</span>
          <span>-100</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

// ==================== 常量定义 ====================
const TILE_SIZE = 120
const MAX_LEVEL = 12
const MIN_LEVEL = 0
const MAX_CACHE_SIZE = 200
const WORLD_FREQ_START = 900e6
const WORLD_FREQ_END = 1100e6
const WORLD_TIME_START = Date.now() - 3600 * 1000
const WORLD_TIME_END = Date.now()

const WORLD_SIGNALS = [
  { freq: 920e6, bandwidth: 8e6, level: -30, type: 'continuous' },
  { freq: 950e6, bandwidth: 12e6, level: -25, type: 'pulsed' },
  { freq: 980e6, bandwidth: 5e6, level: -35, type: 'continuous' },
  { freq: 1020e6, bandwidth: 10e6, level: -28, type: 'pulsed' },
  { freq: 1050e6, bandwidth: 6e6, level: -32, type: 'continuous' },
  { freq: 1080e6, bandwidth: 4e6, level: -38, type: 'intermittent' },
]

// ==================== DOM 引用 ====================
const containerRef = ref(null)
const spectrumAreaRef = ref(null)
const spectrumCanvasRef = ref(null)
const waterfallAreaRef = ref(null)
const waterfallCanvasRef = ref(null)
const colorBarCanvasRef = ref(null)

// ==================== 状态 ====================
const currentLevel = ref(0)
const hoverInfo = ref({ visible: false, freq: 0, level: null })
const tooltip = ref({ visible: false, x: 0, y: 0, freq: 0, level: null })

const isSpectrumBoxSelecting = ref(false)
const spectrumBoxSelectionPersist = ref(false)
const spectrumBoxSelection = ref({ startX: 0, endX: 0 })
const spectrumBoxSelectionInfo = ref({ visible: false, freqStart: 0, freqEnd: 0, centerFreq: 0, bandwidth: 0 })

const isWaterfallBoxSelecting = ref(false)
const waterfallBoxSelectionPersist = ref(false)
const waterfallBoxSelection = ref({ startX: 0, startY: 0, endX: 0, endY: 0 })
const waterfallBoxSelectionInfo = ref({ visible: false, freqStart: 0, freqEnd: 0, timeStart: 0, timeEnd: 0 })

const tooltipStyle = computed(() => ({
  left: tooltip.value.x + 15 + 'px',
  top: tooltip.value.y + 15 + 'px'
}))

const spectrumBoxSelectionStyle = computed(() => ({
  left: Math.min(spectrumBoxSelection.value.startX, spectrumBoxSelection.value.endX) + 'px',
  top: 0,
  width: Math.abs(spectrumBoxSelection.value.endX - spectrumBoxSelection.value.startX) + 'px',
  height: '100%'
}))

const waterfallBoxSelectionStyle = computed(() => ({
  left: Math.min(waterfallBoxSelection.value.startX, waterfallBoxSelection.value.endX) + 'px',
  top: Math.min(waterfallBoxSelection.value.startY, waterfallBoxSelection.value.endY) + 'px',
  width: Math.abs(waterfallBoxSelection.value.endX - waterfallBoxSelection.value.startX) + 'px',
  height: Math.abs(waterfallBoxSelection.value.endY - waterfallBoxSelection.value.startY) + 'px'
}))

const spectrumViewport = ref({
  freqStart: WORLD_FREQ_START,
  freqEnd: WORLD_FREQ_END,
  refLevel: 0,
  minLevel: -100
})

const waterfallViewport = ref({
  x: 0,
  y: 0,
  scale: 1,
  width: 0,
  height: 0
})

let worldWidth = 0
let worldHeight = 0

let sessionId = ''

// ==================== LRU 缓存 ====================
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get(key) {
    const item = this.cache.get(key)
    if (item) {
      item.lastUsed = Date.now()
      return item.image
    }
    return null
  }

  set(key, image) {
    if (this.cache.size >= this.maxSize) {
      let oldestKey = null
      let oldestTime = Infinity
      for (const [k, v] of this.cache) {
        if (v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed
          oldestKey = k
        }
      }
      if (oldestKey) this.cache.delete(oldestKey)
    }
    this.cache.set(key, { image, lastUsed: Date.now() })
  }

  clear() {
    this.cache.clear()
  }
}

const tileCache = new LRUCache(MAX_CACHE_SIZE)
const loadingTiles = new Set()

// ==================== 瓦片加载 ====================
function getTileKey(level, x, y) {
  return `${sessionId}_${level}_${x}_${y}`
}

async function loadTile(level, x, y) {
  const key = getTileKey(level, x, y)
  const cached = tileCache.get(key)
  if (cached) return cached
  if (loadingTiles.has(key)) return null

  loadingTiles.add(key)
  try {
    const url = `/api/history/tile?level=${level}&x=${x}&y=${y}&sessionId=${sessionId}&type=waterfall`
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Tile load failed'))
      img.src = url
    })
    tileCache.set(key, image)
    loadingTiles.delete(key)
    return image
  } catch (e) {
    loadingTiles.delete(key)
    return null
  }
}

// ==================== 频谱图绘制 ====================
function generateSpectrumData(points = 512) {
  const data = []
  const freqRange = spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart

  for (let i = 0; i < points; i++) {
    const freqRatio = i / points
    const freq = spectrumViewport.value.freqStart + freqRange * freqRatio

    let value = -85 + (Math.random() - 0.5) * 6

    for (const signal of WORLD_SIGNALS) {
      if (freq >= signal.freq - signal.bandwidth / 2 && freq <= signal.freq + signal.bandwidth / 2) {
        const centerDistance = Math.abs(freq - signal.freq) / (signal.bandwidth / 2)
        const attenuation = Math.exp(-centerDistance * centerDistance * 2)

        let signalLevel = signal.level
        if (signal.type === 'pulsed') {
          const pulsePhase = Math.sin(Date.now() * 0.005) > 0.3 ? 1 : 0.1
          signalLevel = signal.level * pulsePhase
        } else if (signal.type === 'intermittent') {
          signalLevel = Math.random() > 0.7 ? signal.level : -80
        } else {
          signalLevel = signal.level + Math.sin(Date.now() * 0.002 + freqRatio * 5) * 5
        }

        value = Math.max(value, signalLevel * attenuation + value * (1 - attenuation))
      }
    }

    data.push(value)
  }

  return data
}

function drawSpectrum() {
  const canvas = spectrumCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const width = Math.floor(canvas.width / dpr)
  const height = Math.floor(canvas.height / dpr)

  if (width <= 0 || height <= 0) return

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#0a1628'
  ctx.fillRect(0, 0, width, height)

  const plotWidth = width - 70
  const plotHeight = height - 40
  const plotX = 60
  const plotY = 10

  drawSpectrumGrid(ctx, plotX, plotY, plotWidth, plotHeight)
  drawSpectrumAxes(ctx, plotX, plotY, plotWidth, plotHeight, width, height)

  const spectrumData = generateSpectrumData(plotWidth)

  ctx.save()
  ctx.beginPath()
  ctx.rect(plotX, plotY, plotWidth, plotHeight)
  ctx.clip()

  ctx.strokeStyle = '#00ff66'
  ctx.lineWidth = 1.5
  ctx.shadowColor = '#00ff66'
  ctx.shadowBlur = 5
  ctx.beginPath()

  const { refLevel, minLevel } = spectrumViewport.value
  const levelRange = refLevel - minLevel

  for (let i = 0; i < spectrumData.length; i++) {
    const x = plotX + i
    const ratio = (refLevel - spectrumData[i]) / levelRange
    const y = plotY + ratio * plotHeight

    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.fillStyle = 'rgba(0, 255, 100, 0.1)'
  ctx.beginPath()
  ctx.moveTo(plotX, plotY + plotHeight)
  for (let i = 0; i < spectrumData.length; i++) {
    const x = plotX + i
    const ratio = (refLevel - spectrumData[i]) / levelRange
    const y = plotY + ratio * plotHeight
    ctx.lineTo(x, y)
  }
  ctx.lineTo(plotX + plotWidth, plotY + plotHeight)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
  ctx.restore()
}

function drawSpectrumGrid(ctx, plotX, plotY, plotWidth, plotHeight) {
  ctx.strokeStyle = '#1a3a5c'
  ctx.lineWidth = 0.5

  for (let i = 0; i <= 10; i++) {
    const x = plotX + (plotWidth / 10) * i
    ctx.beginPath()
    ctx.moveTo(x, plotY)
    ctx.lineTo(x, plotY + plotHeight)
    ctx.stroke()
  }

  for (let i = 0; i <= 8; i++) {
    const y = plotY + (plotHeight / 8) * i
    ctx.beginPath()
    ctx.moveTo(plotX, y)
    ctx.lineTo(plotX + plotWidth, y)
    ctx.stroke()
  }
}

function drawSpectrumAxes(ctx, plotX, plotY, plotWidth, plotHeight, width, height) {
  ctx.strokeStyle = '#3a6b9c'
  ctx.lineWidth = 1
  ctx.fillStyle = '#8ab4c7'
  ctx.font = '11px monospace'

  ctx.beginPath()
  ctx.moveTo(plotX, plotY + plotHeight)
  ctx.lineTo(plotX + plotWidth, plotY + plotHeight)
  ctx.stroke()

  ctx.textAlign = 'center'
  for (let i = 0; i <= 10; i++) {
    const x = plotX + (plotWidth / 10) * i
    const freq = spectrumViewport.value.freqStart + (spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart) * (i / 10)
    ctx.fillText((freq / 1e6).toFixed(0), x, plotY + plotHeight + 15)
  }
  ctx.fillText('频率 (MHz)', plotX + plotWidth / 2, plotY + plotHeight + 30)

  ctx.beginPath()
  ctx.moveTo(plotX, plotY)
  ctx.lineTo(plotX, plotY + plotHeight)
  ctx.stroke()

  ctx.textAlign = 'right'
  for (let i = 0; i <= 8; i++) {
    const y = plotY + (plotHeight / 8) * i
    const level = spectrumViewport.value.refLevel - i * (spectrumViewport.value.refLevel - spectrumViewport.value.minLevel) / 8
    ctx.fillText(level.toFixed(0), plotX - 5, y + 4)
  }
  ctx.save()
  ctx.translate(15, plotY + plotHeight / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillText('功率 (dBm)', 0, 0)
  ctx.restore()
}

// ==================== 频谱图交互 ====================
function onSpectrumMouseDown(e) {
  if (e.button !== 0) return
  e.preventDefault()

  const canvas = spectrumCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left

  isSpectrumBoxSelecting.value = true
  spectrumBoxSelectionPersist.value = false
  spectrumBoxSelectionInfo.value.visible = false
  spectrumBoxSelection.value = { startX: x, endX: x }
}

function onSpectrumMouseMove(e) {
  const canvas = spectrumCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const plotX = 60
  const plotWidth = rect.width - 70
  const freqRange = spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart
  const freq = spectrumViewport.value.freqStart + (Math.max(0, Math.min(plotWidth, x - plotX)) / plotWidth) * freqRange

  hoverInfo.value = { visible: true, freq, level: null }
  tooltip.value = { visible: true, x, y, freq, level: null }

  if (isSpectrumBoxSelecting.value) {
    spectrumBoxSelection.value.endX = x
  }
}

function onSpectrumMouseUp() {
  if (isSpectrumBoxSelecting.value) {
    isSpectrumBoxSelecting.value = false

    const canvas = spectrumCanvasRef.value
    const rect = canvas.getBoundingClientRect()
    const plotX = 60
    const plotWidth = rect.width - 70
    const freqRange = spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart

    const minX = Math.min(spectrumBoxSelection.value.startX, spectrumBoxSelection.value.endX)
    const maxX = Math.max(spectrumBoxSelection.value.startX, spectrumBoxSelection.value.endX)

    if (Math.abs(maxX - minX) > 10) {
      spectrumBoxSelectionPersist.value = true
      const startFreq = spectrumViewport.value.freqStart + (Math.max(0, minX - plotX) / plotWidth) * freqRange
      const endFreq = spectrumViewport.value.freqStart + (Math.max(0, maxX - plotX) / plotWidth) * freqRange

      spectrumBoxSelectionInfo.value = {
        visible: true,
        freqStart: startFreq,
        freqEnd: endFreq,
        centerFreq: (startFreq + endFreq) / 2,
        bandwidth: Math.abs(endFreq - startFreq)
      }
    }
  }
}

function onSpectrumMouseLeave() {
  tooltip.value.visible = false
  hoverInfo.value.visible = false
}

function onSpectrumWheel(e) {
  e.preventDefault()

  const canvas = spectrumCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left

  const plotX = 60
  const plotWidth = rect.width - 70

  const zoomFactor = e.deltaY < 0 ? 0.8 : 1.2
  const freqRange = spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart
  const mouseFreq = spectrumViewport.value.freqStart + (Math.max(0, Math.min(plotWidth, x - plotX)) / plotWidth) * freqRange

  const newRange = freqRange * zoomFactor
  const offsetRatio = (mouseFreq - spectrumViewport.value.freqStart) / freqRange

  let newStart = mouseFreq - newRange * offsetRatio
  let newEnd = mouseFreq + newRange * (1 - offsetRatio)

  if (newStart < WORLD_FREQ_START) {
    const diff = WORLD_FREQ_START - newStart
    newStart += diff
    newEnd += diff
  }
  if (newEnd > WORLD_FREQ_END) {
    const diff = newEnd - WORLD_FREQ_END
    newEnd -= diff
    newStart -= diff
  }

  spectrumViewport.value.freqStart = Math.max(WORLD_FREQ_START, newStart)
  spectrumViewport.value.freqEnd = Math.min(WORLD_FREQ_END, newEnd)

  syncWaterfallToSpectrum()
  drawSpectrum()
}

function applySpectrumBoxSelection() {
  spectrumViewport.value.freqStart = spectrumBoxSelectionInfo.value.freqStart
  spectrumViewport.value.freqEnd = spectrumBoxSelectionInfo.value.freqEnd
  spectrumBoxSelectionInfo.value.visible = false
  spectrumBoxSelectionPersist.value = false

  syncWaterfallToSpectrum()
  drawSpectrum()
}

function cancelSpectrumBoxSelection() {
  spectrumBoxSelectionInfo.value.visible = false
  spectrumBoxSelectionPersist.value = false
}

function syncWaterfallToSpectrum() {
  const freqStart = spectrumViewport.value.freqStart
  const freqEnd = spectrumViewport.value.freqEnd
  const freqRatio = (freqStart - WORLD_FREQ_START) / (WORLD_FREQ_END - WORLD_FREQ_START)
  const freqEndRatio = (freqEnd - WORLD_FREQ_START) / (WORLD_FREQ_END - WORLD_FREQ_START)

  waterfallViewport.value.x = freqRatio * worldWidth
  const viewWidth = (freqEndRatio - freqRatio) * worldWidth
  waterfallViewport.value.scale = waterfallViewport.value.width / Math.max(1, viewWidth)

  scheduleWaterfallRender()
}

// ==================== 瀑布图渲染 ====================
function getTilesPerSide(level) {
  return Math.pow(2, level + 1)
}

function getWorldSize(level) {
  const tilesPerSide = getTilesPerSide(level)
  return { width: tilesPerSide * TILE_SIZE, height: tilesPerSide * TILE_SIZE }
}

function pixelToWorld(px, py) {
  const paddingLeft = 60
  return {
    x: waterfallViewport.value.x + (px - paddingLeft) / waterfallViewport.value.scale,
    y: waterfallViewport.value.y + py / waterfallViewport.value.scale
  }
}

function worldToPixel(wx, wy) {
  return {
    x: (wx - waterfallViewport.value.x) * waterfallViewport.value.scale,
    y: (wy - waterfallViewport.value.y) * waterfallViewport.value.scale
  }
}

function getVisibleTiles() {
  const level = currentLevel.value
  const tilesPerSide = getTilesPerSide(level)

  const viewLeft = waterfallViewport.value.x
  const viewTop = waterfallViewport.value.y
  const viewRight = waterfallViewport.value.x + waterfallViewport.value.width / waterfallViewport.value.scale
  const viewBottom = waterfallViewport.value.y + waterfallViewport.value.height / waterfallViewport.value.scale

  const startX = Math.max(0, Math.floor(viewLeft / TILE_SIZE))
  const endX = Math.min(tilesPerSide, Math.ceil(viewRight / TILE_SIZE))
  const startY = Math.max(0, Math.floor(viewTop / TILE_SIZE))
  const endY = Math.min(tilesPerSide, Math.ceil(viewBottom / TILE_SIZE))

  const tiles = []
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      tiles.push({ level, x, y })
    }
  }
  return tiles
}

async function renderWaterfall() {
  const canvas = waterfallCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const width = waterfallViewport.value.width
  const height = waterfallViewport.value.height

  if (width <= 0 || height <= 0) return

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, width, height)

  const paddingLeft = 60
  const paddingBottom = 30
  const plotWidth = width - paddingLeft
  const plotHeight = height - paddingBottom

  ctx.save()
  ctx.beginPath()
  ctx.rect(paddingLeft, 0, plotWidth, plotHeight)
  ctx.clip()

  const tiles = getVisibleTiles()

  for (const tile of tiles) {
    const img = await loadTile(tile.level, tile.x, tile.y)
    if (img) {
      const screenPos = worldToPixel(tile.x * TILE_SIZE, tile.y * TILE_SIZE)
      const drawSize = TILE_SIZE * waterfallViewport.value.scale
      ctx.drawImage(img, screenPos.x + paddingLeft, screenPos.y, drawSize, drawSize)
    } else {
      const screenPos = worldToPixel(tile.x * TILE_SIZE, tile.y * TILE_SIZE)
      const drawSize = TILE_SIZE * waterfallViewport.value.scale
      ctx.fillStyle = 'rgba(20, 30, 50, 0.5)'
      ctx.fillRect(screenPos.x + paddingLeft, screenPos.y, drawSize, drawSize)
    }
  }

  const gridSpacing = TILE_SIZE * waterfallViewport.value.scale
  const offsetX = -(waterfallViewport.value.x * waterfallViewport.value.scale) % gridSpacing
  const offsetY = -(waterfallViewport.value.y * waterfallViewport.value.scale) % gridSpacing

  ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)'
  ctx.lineWidth = 0.5

  for (let x = offsetX; x < plotWidth; x += gridSpacing) {
    ctx.beginPath()
    ctx.moveTo(paddingLeft + x, 0)
    ctx.lineTo(paddingLeft + x, plotHeight)
    ctx.stroke()
  }

  for (let y = offsetY; y < plotHeight; y += gridSpacing) {
    ctx.beginPath()
    ctx.moveTo(paddingLeft, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  ctx.restore()

  drawWaterfallAxes(ctx, width, height)
  ctx.restore()
}

function drawWaterfallAxes(ctx, width, height) {
  const paddingLeft = 60
  const paddingBottom = 30
  const plotWidth = width - paddingLeft
  const plotHeight = height - paddingBottom

  ctx.fillStyle = '#8ab4c7'
  ctx.font = '11px monospace'

  ctx.strokeStyle = '#3a6b9c'
  ctx.lineWidth = 1

  ctx.beginPath()
  ctx.moveTo(paddingLeft, plotHeight)
  ctx.lineTo(width, plotHeight)
  ctx.stroke()

  ctx.textAlign = 'center'
  for (let i = 0; i <= 10; i++) {
    const plotX = (plotWidth / 10) * i
    const x = paddingLeft + plotX
    const worldX = waterfallViewport.value.x + plotX / waterfallViewport.value.scale
    const freqRatio = worldX / worldWidth
    const freq = WORLD_FREQ_START + freqRatio * (WORLD_FREQ_END - WORLD_FREQ_START)
    ctx.fillText((freq / 1e6).toFixed(0), x, height - 8)
  }
  ctx.fillText('频率 (MHz)', paddingLeft + plotWidth / 2, height)

  ctx.beginPath()
  ctx.moveTo(paddingLeft, 0)
  ctx.lineTo(paddingLeft, plotHeight)
  ctx.stroke()

  ctx.textAlign = 'right'
  for (let i = 0; i <= 5; i++) {
    const y = (plotHeight / 5) * i
    const worldY = waterfallViewport.value.y + y / waterfallViewport.value.scale
    const timeRatio = worldY / worldHeight
    const time = WORLD_TIME_START + timeRatio * (WORLD_TIME_END - WORLD_TIME_START)
    const date = new Date(time)
    ctx.fillText(date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), paddingLeft - 5, y + 4)
  }
  ctx.save()
  ctx.translate(20, plotHeight / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillText('时间', 0, 0)
  ctx.restore()
}

function scheduleWaterfallRender() {
  requestAnimationFrame(() => {
    renderWaterfall()
  })
}

// ==================== 瀑布图交互 ====================
const waterfallInteraction = {
  isDragging: false,
  isBoxSelecting: false,
  dragStartX: 0,
  dragStartY: 0,
  viewStartX: 0,
  viewStartY: 0
}

function onWaterfallMouseDown(e) {
  if (e.button !== 0) return
  e.preventDefault()

  const canvas = waterfallCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const paddingLeft = 60
  if (x < paddingLeft) return

  waterfallInteraction.isDragging = true
  waterfallInteraction.isBoxSelecting = true
  waterfallInteraction.dragStartX = e.clientX
  waterfallInteraction.dragStartY = e.clientY
  waterfallInteraction.viewStartX = waterfallViewport.value.x
  waterfallInteraction.viewStartY = waterfallViewport.value.y

  isWaterfallBoxSelecting.value = true
  waterfallBoxSelectionPersist.value = false
  waterfallBoxSelectionInfo.value.visible = false
  waterfallBoxSelection.value = { startX: x - paddingLeft, startY: y, endX: x - paddingLeft, endY: y }

  canvas.style.cursor = 'crosshair'
}

function onWaterfallMouseMove(e) {
  const canvas = waterfallCanvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const paddingLeft = 60

  if (waterfallInteraction.isDragging && waterfallInteraction.isBoxSelecting) {
    const plotX = Math.max(0, x - paddingLeft)
    waterfallBoxSelection.value.endX = plotX
    waterfallBoxSelection.value.endY = y
  } else if (waterfallInteraction.isDragging) {
    const dx = (e.clientX - waterfallInteraction.dragStartX) / waterfallViewport.value.scale
    const dy = (e.clientY - waterfallInteraction.dragStartY) / waterfallViewport.value.scale

    waterfallViewport.value.x = waterfallInteraction.viewStartX - dx
    waterfallViewport.value.y = waterfallInteraction.viewStartY - dy

    clampWaterfallViewport()
    scheduleWaterfallRender()
  }
}

function onWaterfallMouseUp() {
  const canvas = waterfallCanvasRef.value

  if (waterfallInteraction.isBoxSelecting) {
    isWaterfallBoxSelecting.value = false

    const minX = Math.min(waterfallBoxSelection.value.startX, waterfallBoxSelection.value.endX)
    const maxX = Math.max(waterfallBoxSelection.value.startX, waterfallBoxSelection.value.endX)
    const minY = Math.min(waterfallBoxSelection.value.startY, waterfallBoxSelection.value.endY)
    const maxY = Math.max(waterfallBoxSelection.value.startY, waterfallBoxSelection.value.endY)

    if (Math.abs(maxX - minX) > 10 && Math.abs(maxY - minY) > 10) {
      waterfallBoxSelectionPersist.value = true

      const paddingLeft = 60
      const worldStart = pixelToWorld(minX + paddingLeft, minY)
      const worldEnd = pixelToWorld(maxX + paddingLeft, maxY)

      const freqStartRatio = worldStart.x / worldWidth
      const freqEndRatio = worldEnd.x / worldWidth
      const timeStartRatio = worldStart.y / worldHeight
      const timeEndRatio = worldEnd.y / worldHeight

      waterfallBoxSelectionInfo.value = {
        visible: true,
        freqStart: WORLD_FREQ_START + freqStartRatio * (WORLD_FREQ_END - WORLD_FREQ_START),
        freqEnd: WORLD_FREQ_START + freqEndRatio * (WORLD_FREQ_END - WORLD_FREQ_START),
        timeStart: WORLD_TIME_START + timeStartRatio * (WORLD_TIME_END - WORLD_TIME_START),
        timeEnd: WORLD_TIME_START + timeEndRatio * (WORLD_TIME_END - WORLD_TIME_START)
      }
    }
  }

  waterfallInteraction.isDragging = false
  waterfallInteraction.isBoxSelecting = false
  if (canvas) canvas.style.cursor = 'crosshair'
}

function onWaterfallWheel(e) {
  e.preventDefault()

  const canvas = waterfallCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top

  const worldPosBefore = pixelToWorld(px, py)
  const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8
  const newScale = waterfallViewport.value.scale * zoomFactor

  const targetLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(Math.log2(newScale) + 2)))

  if (targetLevel !== currentLevel.value) {
    changeLevel(targetLevel, worldPosBefore, px - 60, py)
  } else {
    waterfallViewport.value.scale = newScale
    const worldPosAfter = pixelToWorld(px, py)
    waterfallViewport.value.x += worldPosBefore.x - worldPosAfter.x
    waterfallViewport.value.y += worldPosBefore.y - worldPosAfter.y

    clampWaterfallViewport()
    scheduleWaterfallRender()
  }
}

function applyWaterfallBoxSelection() {
  spectrumViewport.value.freqStart = waterfallBoxSelectionInfo.value.freqStart
  spectrumViewport.value.freqEnd = waterfallBoxSelectionInfo.value.freqEnd

  const freqStartRatio = (waterfallBoxSelectionInfo.value.freqStart - WORLD_FREQ_START) / (WORLD_FREQ_END - WORLD_FREQ_START)
  const freqEndRatio = (waterfallBoxSelectionInfo.value.freqEnd - WORLD_FREQ_START) / (WORLD_FREQ_END - WORLD_FREQ_START)
  const timeStartRatio = (waterfallBoxSelectionInfo.value.timeStart - WORLD_TIME_START) / (WORLD_TIME_END - WORLD_TIME_START)
  const timeEndRatio = (waterfallBoxSelectionInfo.value.timeEnd - WORLD_TIME_START) / (WORLD_TIME_END - WORLD_TIME_START)

  waterfallViewport.value.x = freqStartRatio * worldWidth
  waterfallViewport.value.y = timeStartRatio * worldHeight

  const viewWidth = (freqEndRatio - freqStartRatio) * worldWidth
  const viewHeight = (timeEndRatio - timeStartRatio) * worldHeight
  waterfallViewport.value.scale = Math.min(waterfallViewport.value.width / viewWidth, waterfallViewport.value.height / viewHeight)

  waterfallBoxSelectionInfo.value.visible = false
  waterfallBoxSelectionPersist.value = false

  drawSpectrum()
  scheduleWaterfallRender()
}

function cancelWaterfallBoxSelection() {
  waterfallBoxSelectionInfo.value.visible = false
  waterfallBoxSelectionPersist.value = false
}

function changeLevel(newLevel, worldPos, px, py) {
  const oldLevel = currentLevel.value
  currentLevel.value = newLevel

  const worldSize = getWorldSize(newLevel)
  worldWidth = worldSize.width
  worldHeight = worldSize.height

  const oldWorldSize = getWorldSize(oldLevel)
  const scaleRatio = oldWorldSize.width / worldSize.width
  waterfallViewport.value.scale = waterfallViewport.value.scale * scaleRatio

  waterfallViewport.value.x = worldPos.x - px / waterfallViewport.value.scale
  waterfallViewport.value.y = worldPos.y - py / waterfallViewport.value.scale

  clampWaterfallViewport()
  scheduleWaterfallRender()
}

function clampWaterfallViewport() {
  const maxX = worldWidth - waterfallViewport.value.width / waterfallViewport.value.scale
  const maxY = worldHeight - waterfallViewport.value.height / waterfallViewport.value.scale

  waterfallViewport.value.x = Math.max(0, Math.min(waterfallViewport.value.x, maxX))
  waterfallViewport.value.y = Math.max(0, Math.min(waterfallViewport.value.y, maxY))

  const minScale = Math.min(waterfallViewport.value.width / worldWidth, waterfallViewport.value.height / worldHeight)
  const maxScale = 10
  waterfallViewport.value.scale = Math.max(minScale, Math.min(waterfallViewport.value.scale, maxScale))
}

// ==================== 颜色柱绘制 ====================
function drawColorBar() {
  const canvas = colorBarCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const width = 20
  const height = Math.floor(canvas.height / dpr)

  if (height <= 0) return

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, '#ff0000')
  gradient.addColorStop(0.25, '#ffff00')
  gradient.addColorStop(0.5, '#00ff00')
  gradient.addColorStop(0.75, '#00ffff')
  gradient.addColorStop(1, '#0000ff')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.restore()
}

// ==================== 工具方法 ====================
function resetView() {
  currentLevel.value = MIN_LEVEL
  const worldSize = getWorldSize(MIN_LEVEL)
  worldWidth = worldSize.width
  worldHeight = worldSize.height

  waterfallViewport.value.x = 0
  waterfallViewport.value.y = 0
  waterfallViewport.value.scale = waterfallViewport.value.width / worldWidth

  spectrumViewport.value = {
    freqStart: WORLD_FREQ_START,
    freqEnd: WORLD_FREQ_END,
    refLevel: 0,
    minLevel: -100
  }

  tileCache.clear()
  drawSpectrum()
  scheduleWaterfallRender()
}

function zoomIn() {
  if (currentLevel.value < MAX_LEVEL) {
    const canvas = waterfallCanvasRef.value
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const worldPos = pixelToWorld(centerX, centerY)
    changeLevel(currentLevel.value + 1, worldPos, centerX - 60, centerY)
  }
}

function zoomOut() {
  if (currentLevel.value > MIN_LEVEL) {
    const canvas = waterfallCanvasRef.value
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const worldPos = pixelToWorld(centerX, centerY)
    changeLevel(currentLevel.value - 1, worldPos, centerX - 60, centerY)
  }
}

function formatFreq(freq) {
  if (!freq || isNaN(freq)) return '--'
  if (freq >= 1e9) return (freq / 1e9).toFixed(3) + ' GHz'
  if (freq >= 1e6) return (freq / 1e6).toFixed(1) + ' MHz'
  if (freq >= 1e3) return (freq / 1e3).toFixed(0) + ' kHz'
  return freq.toFixed(0) + ' Hz'
}

function formatTime(timestamp) {
  if (!timestamp) return '--'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ==================== 暴露方法 ====================
defineExpose({
  resizeCanvas
})

// ==================== 画布尺寸调整 ====================
function resizeCanvas() {
  const spectrumArea = spectrumAreaRef.value
  const spectrumCanvas = spectrumCanvasRef.value
  const waterfallArea = waterfallAreaRef.value
  const waterfallCanvas = waterfallCanvasRef.value
  const colorBarCanvas = colorBarCanvasRef.value

  const dpr = window.devicePixelRatio || 1

  if (spectrumArea && spectrumCanvas) {
    const sW = spectrumArea.clientWidth
    const sH = spectrumArea.clientHeight
    if (sW > 0 && sH > 0) {
      spectrumCanvas.width = sW * dpr
      spectrumCanvas.height = sH * dpr
      spectrumCanvas.style.width = sW + 'px'
      spectrumCanvas.style.height = sH + 'px'
    }
  }

  if (waterfallArea && waterfallCanvas) {
    const wW = waterfallArea.clientWidth
    const wH = waterfallArea.clientHeight
    if (wW > 0 && wH > 0) {
      waterfallCanvas.width = wW * dpr
      waterfallCanvas.height = wH * dpr
      waterfallCanvas.style.width = wW + 'px'
      waterfallCanvas.style.height = wH + 'px'

      waterfallViewport.value.width = wW
      waterfallViewport.value.height = wH
    }
  }

  if (colorBarCanvas) {
    const cbW = 20
    const cbH = waterfallArea?.clientHeight || 200
    if (cbH > 0) {
      colorBarCanvas.width = cbW * dpr
      colorBarCanvas.height = cbH * dpr
      colorBarCanvas.style.width = cbW + 'px'
      colorBarCanvas.style.height = cbH + 'px'
    }
  }

  if (worldWidth === 0) {
    const worldSize = getWorldSize(currentLevel.value)
    worldWidth = worldSize.width
    worldHeight = worldSize.height
  }
  if (waterfallViewport.value.width > 0 && worldWidth > 0) {
    waterfallViewport.value.scale = waterfallViewport.value.width / worldWidth
  }

  drawSpectrum()
  scheduleWaterfallRender()
  drawColorBar()
}

let resizeObserver = null

// ==================== 生命周期 ====================
onMounted(async () => {
  try {
    const now = Date.now()
    const response = await fetch('/api/history/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeStart: now - 3600 * 1000,
        timeEnd: now,
        freqStart: WORLD_FREQ_START,
        freqEnd: WORLD_FREQ_END
      })
    })
    if (response.ok) {
      const data = await response.json()
      sessionId = data.sessionId
    }
  } catch (e) {
    sessionId = 'mock-session-' + Date.now()
  }

  const worldSize = getWorldSize(currentLevel.value)
  worldWidth = worldSize.width
  worldHeight = worldSize.height

  const tryInitialize = () => {
    const spectrumArea = spectrumAreaRef.value
    const waterfallArea = waterfallAreaRef.value

    if (spectrumArea && waterfallArea &&
        spectrumArea.clientWidth > 0 && waterfallArea.clientHeight > 0) {
      resizeCanvas()
      return true
    }
    return false
  }

  if (!tryInitialize()) {
    const checkInterval = setInterval(() => {
      if (tryInitialize()) {
        clearInterval(checkInterval)
      }
    }, 50)
    setTimeout(() => clearInterval(checkInterval), 5000)
  }

  resizeObserver = new ResizeObserver(() => {
    resizeCanvas()
  })

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  tileCache.clear()
})
</script>

<style scoped>
.history-spectrum-v2-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a1628;
  color: #e0e0e0;
  overflow: hidden;
}

.toolbar {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #0d1f35;
  border-bottom: 1px solid #1e4976;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level-info {
  margin-left: 16px;
  font-family: monospace;
  color: #8ab4c7;
}

.hover-info {
  font-family: monospace;
  color: #8ab4c7;
}

.spectrum-area {
  position: relative;
  flex: 0 0 35%;
  min-height: 180px;
  background: #0a0a0a;
  border-bottom: 1px solid #1e4976;
}

.spectrum-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}

.waterfall-area {
  position: relative;
  flex: 1;
  min-height: 200px;
  background: #0a0a0a;
  padding-right: 60px;
}

.waterfall-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}

.tooltip {
  position: absolute;
  background: rgba(13, 31, 53, 0.95);
  border: 1px solid #1e4976;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: #e0e0e0;
  pointer-events: none;
  z-index: 100;
  white-space: nowrap;
}

.box-selection {
  position: absolute;
  border: 2px dashed #ff4d4d;
  background: rgba(255, 77, 77, 0.1);
  pointer-events: none;
  z-index: 50;
}

.waterfall-box-selection {
  position: absolute;
  left: 60px;
  border: 2px dashed #ff4d4d;
  background: rgba(255, 77, 77, 0.1);
  pointer-events: none;
  z-index: 50;
}

.box-selection-info {
  position: absolute;
  top: 10px;
  right: 60px;
  background: rgba(13, 31, 53, 0.95);
  border: 1px solid #1e4976;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  color: #e0e0e0;
  z-index: 100;
  min-width: 200px;
}

.waterfall-selection-info {
  top: 10px;
  left: 10px;
  right: auto;
}

.info-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.color-bar {
  position: absolute;
  right: 10px;
  top: 10px;
  bottom: 40px;
  width: 40px;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  z-index: 50;
  background: rgba(10, 22, 40, 0.9);
  border: 1px solid #1e4976;
  border-radius: 4px;
  padding: 4px;
}

.color-bar-canvas {
  flex: 0 0 18px;
  height: 100%;
  display: block;
}

.color-bar-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding-left: 4px;
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 10px;
  color: #8ab4c7;
  font-family: monospace;
  line-height: 1;
}

.color-bar-labels span {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
</style>