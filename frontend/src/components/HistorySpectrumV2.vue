<template>
  <div class="history-spectrum-v2-container">
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
        @mouseleave="onSpectrumMouseUp"
        @wheel="onSpectrumWheel"
      ></canvas>
      <div v-if="tooltip.visible" class="tooltip" :style="tooltipStyle">
        <div>频率: {{ formatFreq(tooltip.freq) }}</div>
        <div>功率: {{ tooltip.level?.toFixed(1) ?? '--' }} dBm</div>
      </div>
      <!-- 框选框 -->
      <div v-if="isBoxSelecting" class="box-selection" :style="boxSelectionStyle"></div>
      <!-- 框选信息 -->
      <div v-if="boxSelectionInfo.visible" class="box-selection-info">
        <div>频率范围: {{ formatFreq(boxSelectionInfo.freqStart) }} - {{ formatFreq(boxSelectionInfo.freqEnd) }}</div>
        <div>中心频率: {{ formatFreq(boxSelectionInfo.centerFreq) }}</div>
        <div>带宽: {{ formatFreq(boxSelectionInfo.bandwidth) }}</div>
        <div class="info-actions">
          <el-button size="small" type="primary" @click="applyBoxSelection">应用</el-button>
          <el-button size="small" @click="cancelBoxSelection">取消</el-button>
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
      <!-- 时间轴 -->
      <div class="time-axis">
        <span v-for="(label, idx) in timeAxisLabels" :key="idx" :style="{ left: idx * 100 / timeAxisLabels.length + '%' }">
          {{ label }}
        </span>
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
const spectrumAreaRef = ref(null)
const spectrumCanvasRef = ref(null)
const waterfallAreaRef = ref(null)
const waterfallCanvasRef = ref(null)

// ==================== 状态 ====================
const currentLevel = ref(0)
const hoverInfo = ref({ visible: false, freq: 0, level: null })
const tooltip = ref({ visible: false, x: 0, y: 0, freq: 0, level: null })
const isBoxSelecting = ref(false)
const boxSelection = ref({ startX: 0, startY: 0, endX: 0, endY: 0 })
const boxSelectionInfo = ref({ visible: false, freqStart: 0, freqEnd: 0, centerFreq: 0, bandwidth: 0 })

const tooltipStyle = computed(() => ({
  left: tooltip.value.x + 15 + 'px',
  top: tooltip.value.y + 15 + 'px'
}))

const boxSelectionStyle = computed(() => ({
  left: Math.min(boxSelection.value.startX, boxSelection.value.endX) + 'px',
  top: 0,
  width: Math.abs(boxSelection.value.endX - boxSelection.value.startX) + 'px',
  height: '100%'
}))

const timeAxisLabels = computed(() => {
  const labels = []
  for (let i = 0; i <= 10; i++) {
    const time = WORLD_TIME_START + (WORLD_TIME_END - WORLD_TIME_START) * (i / 10)
    labels.push(new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
  }
  return labels
})

// 频谱图视口
const spectrumViewport = ref({
  freqStart: WORLD_FREQ_START,
  freqEnd: WORLD_FREQ_END,
  refLevel: 0,
  minLevel: -100
})

// 瀑布图视口
const waterfallViewport = {
  x: 0,
  y: 0,
  scale: 1,
  width: 0,
  height: 0
}

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
      if (Math.abs(freq - signal.freq) < signal.bandwidth) {
        const distance = Math.abs(freq - signal.freq) / signal.bandwidth
        const attenuation = Math.exp(-distance * distance * 2)

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

  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#0a1628'
  ctx.fillRect(0, 0, width, height)

  drawSpectrumGrid(ctx, width, height)
  drawSpectrumAxes(ctx, width, height)

  const plotWidth = width - 60
  const plotHeight = height - 30
  const plotX = 60
  const plotY = 0

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
}

function drawSpectrumGrid(ctx, width, height) {
  ctx.strokeStyle = '#1a3a5c'
  ctx.lineWidth = 0.5

  const plotWidth = width - 60
  const plotHeight = height - 30

  for (let i = 0; i <= 10; i++) {
    const x = 60 + (plotWidth / 10) * i
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, plotHeight)
    ctx.stroke()
  }

  for (let i = 0; i <= 8; i++) {
    const y = (plotHeight / 8) * i
    ctx.beginPath()
    ctx.moveTo(60, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

function drawSpectrumAxes(ctx, width, height) {
  ctx.strokeStyle = '#3a6b9c'
  ctx.lineWidth = 1.5
  ctx.fillStyle = '#e0e0e0'
  ctx.font = '12px monospace'

  const plotWidth = width - 60
  const plotHeight = height - 30

  ctx.beginPath()
  ctx.moveTo(60, plotHeight)
  ctx.lineTo(width, plotHeight)
  ctx.stroke()

  ctx.textAlign = 'center'
  for (let i = 0; i <= 10; i++) {
    const x = 60 + (plotWidth / 10) * i
    const freq = spectrumViewport.value.freqStart + (spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart) * (i / 10)
    ctx.fillText((freq / 1e6).toFixed(0) + 'M', x, height - 8)
  }

  ctx.beginPath()
  ctx.moveTo(60, 0)
  ctx.lineTo(60, plotHeight)
  ctx.stroke()

  ctx.textAlign = 'right'
  for (let i = 0; i <= 8; i++) {
    const y = (plotHeight / 8) * i
    const level = spectrumViewport.value.refLevel - i * 12.5
    ctx.fillText(level.toFixed(0) + 'dBm', 55, y + 4)
  }
}

// ==================== 频谱图交互 ====================
function onSpectrumMouseDown(e) {
  if (e.button !== 0) return
  e.preventDefault()

  const canvas = spectrumCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left

  isBoxSelecting.value = true
  boxSelection.value = { startX: x, startY: 0, endX: x, endY: 0 }
}

function onSpectrumMouseMove(e) {
  const canvas = spectrumCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left

  const plotX = 60
  const plotWidth = rect.width - 60
  const freqRange = spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart
  const freq = spectrumViewport.value.freqStart + (Math.max(0, Math.min(plotWidth, x - plotX)) / plotWidth) * freqRange

  hoverInfo.value = { visible: true, freq, level: null }
  tooltip.value = { visible: true, x, y: e.clientY - rect.top, freq, level: null }

  if (isBoxSelecting.value) {
    boxSelection.value.endX = x

    const minX = Math.min(boxSelection.value.startX, boxSelection.value.endX)
    const maxX = Math.max(boxSelection.value.startX, boxSelection.value.endX)
    const startFreq = spectrumViewport.value.freqStart + (Math.max(0, minX - plotX) / plotWidth) * freqRange
    const endFreq = spectrumViewport.value.freqStart + (Math.max(0, maxX - plotX) / plotWidth) * freqRange

    boxSelectionInfo.value = {
      visible: true,
      freqStart: startFreq,
      freqEnd: endFreq,
      centerFreq: (startFreq + endFreq) / 2,
      bandwidth: Math.abs(endFreq - startFreq)
    }
  }
}

function onSpectrumMouseUp() {
  if (isBoxSelecting.value) {
    isBoxSelecting.value = false
  } else {
    tooltip.value.visible = false
    hoverInfo.value.visible = false
  }
}

function onSpectrumWheel(e) {
  e.preventDefault()

  const canvas = spectrumCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left

  const plotX = 60
  const plotWidth = rect.width - 60

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

  drawSpectrum()
}

function applyBoxSelection() {
  spectrumViewport.value.freqStart = boxSelectionInfo.value.freqStart
  spectrumViewport.value.freqEnd = boxSelectionInfo.value.freqEnd
  boxSelectionInfo.value.visible = false
  drawSpectrum()
}

function cancelBoxSelection() {
  boxSelectionInfo.value.visible = false
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
  return {
    x: waterfallViewport.x + px / waterfallViewport.scale,
    y: waterfallViewport.y + py / waterfallViewport.scale
  }
}

function worldToPixel(wx, wy) {
  return {
    x: (wx - waterfallViewport.x) * waterfallViewport.scale,
    y: (wy - waterfallViewport.y) * waterfallViewport.scale
  }
}

function getVisibleTiles() {
  const level = currentLevel.value
  const tilesPerSide = getTilesPerSide(level)

  const viewLeft = waterfallViewport.x
  const viewTop = waterfallViewport.y
  const viewRight = waterfallViewport.x + waterfallViewport.width / waterfallViewport.scale
  const viewBottom = waterfallViewport.y + waterfallViewport.height / waterfallViewport.scale

  const startX = Math.max(0, Math.floor(viewLeft / TILE_SIZE))
  const endX = Math.min(tilesPerSide, Math.ceil(viewRight / TILE_SIZE))
  const startY = Math.max(0, Math.floor(viewTop / TILE_SIZE))
  const endY = Math.min(tilesPerSide, Math.ceil(viewBottom / TILE_SIZE))

  const tiles = []
  const centerX = (viewLeft + viewRight) / 2
  const centerY = (viewTop + viewBottom) / 2

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tileCenterX = (x + 0.5) * TILE_SIZE
      const tileCenterY = (y + 0.5) * TILE_SIZE
      const dist = Math.sqrt(Math.pow(tileCenterX - centerX, 2) + Math.pow(tileCenterY - centerY, 2))
      tiles.push({ level, x, y, dist })
    }
  }

  tiles.sort((a, b) => a.dist - b.dist)
  return tiles
}

async function renderWaterfall() {
  const canvas = waterfallCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, waterfallViewport.width, waterfallViewport.height)

  const tiles = getVisibleTiles()
  const level = currentLevel.value

  for (let l = level - 1; l >= 0; l--) {
    const scaleFactor = Math.pow(2, level - l)
    const lowerTilesPerSide = getTilesPerSide(l)

    for (const tile of tiles) {
      const lowerX = Math.floor(tile.x / scaleFactor)
      const lowerY = Math.floor(tile.y / scaleFactor)

      if (lowerX < lowerTilesPerSide && lowerY < lowerTilesPerSide) {
        const key = getTileKey(l, lowerX, lowerY)
        const img = tileCache.get(key)
        if (img) {
          const srcX = (tile.x % scaleFactor) * (TILE_SIZE / scaleFactor)
          const srcY = (tile.y % scaleFactor) * (TILE_SIZE / scaleFactor)
          const srcSize = TILE_SIZE / scaleFactor
          const screenPos = worldToPixel(tile.x * TILE_SIZE, tile.y * TILE_SIZE)
          const drawSize = TILE_SIZE * waterfallViewport.scale

          ctx.drawImage(img, srcX, srcY, srcSize, srcSize, screenPos.x, screenPos.y, drawSize, drawSize)
        }
      }
    }
  }

  for (const tile of tiles) {
    const img = await loadTile(tile.level, tile.x, tile.y)
    if (img) {
      const screenPos = worldToPixel(tile.x * TILE_SIZE, tile.y * TILE_SIZE)
      const drawSize = TILE_SIZE * waterfallViewport.scale
      ctx.drawImage(img, screenPos.x, screenPos.y, drawSize, drawSize)
    } else {
      const screenPos = worldToPixel(tile.x * TILE_SIZE, tile.y * TILE_SIZE)
      const drawSize = TILE_SIZE * waterfallViewport.scale
      ctx.fillStyle = 'rgba(20, 30, 50, 0.5)'
      ctx.fillRect(screenPos.x, screenPos.y, drawSize, drawSize)
    }
  }

  const gridSpacing = TILE_SIZE * waterfallViewport.scale
  const offsetX = -(waterfallViewport.x * waterfallViewport.scale) % gridSpacing
  const offsetY = -(waterfallViewport.y * waterfallViewport.scale) % gridSpacing

  ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)'
  ctx.lineWidth = 0.5

  for (let x = offsetX; x < waterfallViewport.width; x += gridSpacing) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, waterfallViewport.height)
    ctx.stroke()
  }

  for (let y = offsetY; y < waterfallViewport.height; y += gridSpacing) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(waterfallViewport.width, y)
    ctx.stroke()
  }
}

function scheduleWaterfallRender() {
  requestAnimationFrame(() => {
    renderWaterfall()
  })
}

// ==================== 瀑布图交互 ====================
const waterfallInteraction = {
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  viewStartX: 0,
  viewStartY: 0
}

function onWaterfallMouseDown(e) {
  if (e.button !== 0) return
  e.preventDefault()

  waterfallInteraction.isDragging = true
  waterfallInteraction.dragStartX = e.clientX
  waterfallInteraction.dragStartY = e.clientY
  waterfallInteraction.viewStartX = waterfallViewport.x
  waterfallInteraction.viewStartY = waterfallViewport.y

  waterfallCanvasRef.value.style.cursor = 'grabbing'
}

function onWaterfallMouseMove(e) {
  if (waterfallInteraction.isDragging) {
    const dx = (e.clientX - waterfallInteraction.dragStartX) / waterfallViewport.scale
    const dy = (e.clientY - waterfallInteraction.dragStartY) / waterfallViewport.scale

    waterfallViewport.x = waterfallInteraction.viewStartX - dx
    waterfallViewport.y = waterfallInteraction.viewStartY - dy

    clampWaterfallViewport()
    scheduleWaterfallRender()
  }
}

function onWaterfallMouseUp() {
  waterfallInteraction.isDragging = false
  if (waterfallCanvasRef.value) {
    waterfallCanvasRef.value.style.cursor = 'crosshair'
  }
}

function onWaterfallWheel(e) {
  e.preventDefault()

  const canvas = waterfallCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top

  const worldPosBefore = pixelToWorld(px, py)
  const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8
  const newScale = waterfallViewport.scale * zoomFactor

  const targetLevel = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(Math.log2(newScale) + 2)))

  if (targetLevel !== currentLevel.value) {
    changeLevel(targetLevel, worldPosBefore, px, py)
  } else {
    waterfallViewport.scale = newScale
    const worldPosAfter = pixelToWorld(px, py)
    waterfallViewport.x += worldPosBefore.x - worldPosAfter.x
    waterfallViewport.y += worldPosBefore.y - worldPosAfter.y

    clampWaterfallViewport()
    scheduleWaterfallRender()
  }
}

function changeLevel(newLevel, worldPos, px, py) {
  const oldLevel = currentLevel.value
  currentLevel.value = newLevel

  const worldSize = getWorldSize(newLevel)
  worldWidth = worldSize.width
  worldHeight = worldSize.height

  const oldWorldSize = getWorldSize(oldLevel)
  const scaleRatio = oldWorldSize.width / worldSize.width
  waterfallViewport.scale = waterfallViewport.scale * scaleRatio

  waterfallViewport.x = worldPos.x - px / waterfallViewport.scale
  waterfallViewport.y = worldPos.y - py / waterfallViewport.scale

  clampWaterfallViewport()
  scheduleWaterfallRender()
}

function clampWaterfallViewport() {
  const maxX = worldWidth - waterfallViewport.width / waterfallViewport.scale
  const maxY = worldHeight - waterfallViewport.height / waterfallViewport.scale

  waterfallViewport.x = Math.max(0, Math.min(waterfallViewport.x, maxX))
  waterfallViewport.y = Math.max(0, Math.min(waterfallViewport.y, maxY))

  const minScale = Math.min(waterfallViewport.width / worldWidth, waterfallViewport.height / worldHeight)
  const maxScale = 10
  waterfallViewport.scale = Math.max(minScale, Math.min(waterfallViewport.scale, maxScale))
}

// ==================== 工具方法 ====================
function resetView() {
  currentLevel.value = MIN_LEVEL
  const worldSize = getWorldSize(MIN_LEVEL)
  worldWidth = worldSize.width
  worldHeight = worldSize.height

  waterfallViewport.x = 0
  waterfallViewport.y = 0
  waterfallViewport.scale = waterfallViewport.width / worldWidth

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
    changeLevel(currentLevel.value + 1, worldPos, centerX, centerY)
  }
}

function zoomOut() {
  if (currentLevel.value > MIN_LEVEL) {
    const canvas = waterfallCanvasRef.value
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const worldPos = pixelToWorld(centerX, centerY)
    changeLevel(currentLevel.value - 1, worldPos, centerX, centerY)
  }
}

function formatFreq(freq) {
  if (!freq || isNaN(freq)) return '--'
  if (freq >= 1e9) return (freq / 1e9).toFixed(3) + ' GHz'
  if (freq >= 1e6) return (freq / 1e6).toFixed(1) + ' MHz'
  if (freq >= 1e3) return (freq / 1e3).toFixed(0) + ' kHz'
  return freq.toFixed(0) + ' Hz'
}

// ==================== 画布尺寸调整 ====================
function resizeCanvas() {
  const spectrumArea = spectrumAreaRef.value
  const spectrumCanvas = spectrumCanvasRef.value
  const waterfallArea = waterfallAreaRef.value
  const waterfallCanvas = waterfallCanvasRef.value

  if (spectrumArea && spectrumCanvas) {
    const dpr = window.devicePixelRatio || 1
    const sW = spectrumArea.clientWidth
    const sH = spectrumArea.clientHeight
    spectrumCanvas.width = sW * dpr
    spectrumCanvas.height = sH * dpr
    spectrumCanvas.style.width = sW + 'px'
    spectrumCanvas.style.height = sH + 'px'
  }

  if (waterfallArea && waterfallCanvas) {
    const dpr = window.devicePixelRatio || 1
    const wW = waterfallArea.clientWidth
    const wH = waterfallArea.clientHeight
    waterfallCanvas.width = wW * dpr
    waterfallCanvas.height = wH * dpr
    waterfallCanvas.style.width = wW + 'px'
    waterfallCanvas.style.height = wH + 'px'

    waterfallViewport.width = wW
    waterfallViewport.height = wH
  }

  if (worldWidth === 0 || waterfallViewport.width === 0) {
    const worldSize = getWorldSize(currentLevel.value)
    worldWidth = worldSize.width
    worldHeight = worldSize.height
    if (waterfallViewport.width > 0) {
      waterfallViewport.scale = waterfallViewport.width / worldWidth
    }
  }

  drawSpectrum()
  scheduleWaterfallRender()
}

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

  // 等待 DOM 完全渲染后再初始化画布
  setTimeout(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
  }, 100)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
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
  min-height: 200px;
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

.box-selection-info {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(13, 31, 53, 0.95);
  border: 1px solid #1e4976;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  color: #e0e0e0;
  z-index: 100;
  min-width: 200px;
}

.info-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.time-axis {
  position: absolute;
  bottom: -20px;
  left: 0;
  right: 0;
  height: 20px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: #0d1f35;
  border-top: 1px solid #1e4976;
}

.time-axis span {
  position: absolute;
  font-size: 11px;
  color: #8ab4c7;
  font-family: monospace;
}
</style>
