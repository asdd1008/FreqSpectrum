<template>
  <div class="history-spectrum-v2-container" ref="containerRef">
    <!-- 查询栏 -->
    <div class="query-bar">
      <div class="query-item">
        <span class="query-label">频率范围 (MHz):</span>
        <el-input-number 
          v-model="queryParams.freqStart" 
          :min="900" 
          :max="1100" 
          :step="1"
          size="small"
          class="query-input"
        />
        <span class="query-separator">-</span>
        <el-input-number 
          v-model="queryParams.freqEnd" 
          :min="900" 
          :max="1100" 
          :step="1"
          size="small"
          class="query-input"
        />
      </div>
      <div class="query-item">
        <span class="query-label">时间范围:</span>
        <el-date-picker 
          v-model="queryParams.timeStart" 
          type="datetime"
          size="small"
          value-format="timestamp"
          class="query-input"
        />
        <span class="query-separator">-</span>
        <el-date-picker 
          v-model="queryParams.timeEnd" 
          type="datetime"
          size="small"
          value-format="timestamp"
          class="query-input"
        />
      </div>
      <el-button size="small" type="primary" @click="handleQuery">查询</el-button>
      <el-button size="small" @click="resetQuery">重置</el-button>
    </div>

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
import { ElMessage } from 'element-plus'

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

const queryParams = ref({
  freqStart: 900,
  freqEnd: 1100,
  timeStart: Date.now() - 3600 * 1000,
  timeEnd: Date.now()
})

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

const waterfallBoxSelectionStyle = computed(() => {
  const paddingLeft = 60
  const paddingTop = 8
  const left = paddingLeft + Math.min(waterfallBoxSelection.value.startX, waterfallBoxSelection.value.endX)
  const top = paddingTop + Math.min(waterfallBoxSelection.value.startY, waterfallBoxSelection.value.endY)
  return {
    left: left + 'px',
    top: top + 'px',
    width: Math.abs(waterfallBoxSelection.value.endX - waterfallBoxSelection.value.startX) + 'px',
    height: Math.abs(waterfallBoxSelection.value.endY - waterfallBoxSelection.value.startY) + 'px'
  }
})

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
const loadingTiles = new Map()
const pendingTiles = []
let tileLoadFrame = null

// ==================== 瓦片加载 ====================
function getTileKey(level, x, y) {
  return `${sessionId}_${level}_${x}_${y}`
}

function enqueueTileLoad(level, x, y, priority = 0) {
  const key = getTileKey(level, x, y)
  if (tileCache.get(key) || loadingTiles.has(key)) return

  const existing = pendingTiles.find(t => t.key === key)
  if (existing) {
    existing.priority = Math.max(existing.priority, priority)
    return
  }

  pendingTiles.push({ level, x, y, key, priority })
  pendingTiles.sort((a, b) => b.priority - a.priority)

  if (!tileLoadFrame) {
    tileLoadFrame = requestAnimationFrame(processTileQueue)
  }
}

async function processTileQueue() {
  tileLoadFrame = null
  if (pendingTiles.length === 0) return

  // 批量处理最多6个瓦片，避免阻塞主线程
  const batch = pendingTiles.splice(0, 6)
  const results = await Promise.allSettled(batch.map(t => loadTileInternal(t.level, t.x, t.y)))

  // 只要还有未完成的，继续处理
  if (pendingTiles.length > 0) {
    tileLoadFrame = requestAnimationFrame(processTileQueue)
  }

  // 如果有瓦片加载完成，重新渲染
  const hasLoaded = results.some(r => r.status === 'fulfilled' && r.value)
  if (hasLoaded) {
    scheduleWaterfallRender()
  }
}

async function loadTileInternal(level, x, y) {
  const key = getTileKey(level, x, y)
  loadingTiles.set(key, true)
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

async function loadTile(level, x, y) {
  const key = getTileKey(level, x, y)
  const cached = tileCache.get(key)
  if (cached) return cached
  return null
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

  // X轴底线
  ctx.beginPath()
  ctx.moveTo(plotX, plotY + plotHeight)
  ctx.lineTo(plotX + plotWidth, plotY + plotHeight)
  ctx.stroke()

  // X轴标签：动态计算避免重叠
  const xLabelWidth = 35
  const xTickCount = Math.min(10, Math.max(4, Math.floor(plotWidth / xLabelWidth)))
  ctx.textAlign = 'center'
  for (let i = 0; i <= xTickCount; i++) {
    const x = plotX + (plotWidth / xTickCount) * i
    const freq = spectrumViewport.value.freqStart + (spectrumViewport.value.freqEnd - spectrumViewport.value.freqStart) * (i / xTickCount)
    ctx.fillText((freq / 1e6).toFixed(0), x, plotY + plotHeight + 15)
  }
  ctx.fillText('频率 (MHz)', plotX + plotWidth / 2, plotY + plotHeight + 30)

  // Y轴线
  ctx.beginPath()
  ctx.moveTo(plotX, plotY)
  ctx.lineTo(plotX, plotY + plotHeight)
  ctx.stroke()

  // Y轴标签：动态计算避免重叠
  const yLabelHeight = 14
  const yTickCount = Math.min(8, Math.max(4, Math.floor(plotHeight / (yLabelHeight * 1.5))))
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= yTickCount; i++) {
    const y = plotY + (plotHeight / yTickCount) * i
    const level = spectrumViewport.value.refLevel - i * (spectrumViewport.value.refLevel - spectrumViewport.value.minLevel) / yTickCount
    ctx.fillText(level.toFixed(0), plotX - 5, y)
  }
  ctx.textBaseline = 'alphabetic'

  // Y轴名称
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
  const effectiveWidth = Math.max(100, waterfallViewport.value.width - 60 - 55)
  waterfallViewport.value.scale = effectiveWidth / Math.max(1, viewWidth)

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
  const paddingTop = 8
  return {
    x: waterfallViewport.value.x + (px - paddingLeft) / waterfallViewport.value.scale,
    y: waterfallViewport.value.y + (py - paddingTop) / waterfallViewport.value.scale
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
  const paddingLeft = 60
  const paddingRight = 55
  const paddingTop = 8
  const paddingBottom = 30
  const effectiveWidth = waterfallViewport.value.width - paddingLeft - paddingRight
  const effectiveHeight = waterfallViewport.value.height - paddingTop - paddingBottom
  const viewRight = waterfallViewport.value.x + effectiveWidth / waterfallViewport.value.scale
  const viewBottom = waterfallViewport.value.y + effectiveHeight / waterfallViewport.value.scale

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
  const paddingRight = 55
  const paddingTop = 8
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingBottom - paddingTop

  ctx.save()
  ctx.beginPath()
  ctx.rect(paddingLeft, paddingTop, plotWidth, plotHeight)
  ctx.clip()

  const tiles = getVisibleTiles()

  // 计算中心点，用于优先级排序
  const centerX = paddingLeft + plotWidth / 2
  const centerY = paddingTop + plotHeight / 2

  // 先排序：中心区域优先
  const sortedTiles = [...tiles].sort((a, b) => {
    const ax = (a.x * TILE_SIZE - waterfallViewport.value.x) * waterfallViewport.value.scale + paddingLeft
    const ay = (a.y * TILE_SIZE - waterfallViewport.value.y) * waterfallViewport.value.scale + paddingTop
    const bx = (b.x * TILE_SIZE - waterfallViewport.value.x) * waterfallViewport.value.scale + paddingLeft
    const by = (b.y * TILE_SIZE - waterfallViewport.value.y) * waterfallViewport.value.scale + paddingTop
    const da = Math.hypot(ax - centerX, ay - centerY)
    const db = Math.hypot(bx - centerX, by - centerY)
    return da - db
  })

  const loadingQueue = []

  for (const tile of sortedTiles) {
    const img = await loadTile(tile.level, tile.x, tile.y)
    const screenPos = worldToPixel(tile.x * TILE_SIZE, tile.y * TILE_SIZE)
    const drawSize = TILE_SIZE * waterfallViewport.value.scale
    const sx = screenPos.x + paddingLeft
    const sy = screenPos.y + paddingTop

    if (img) {
      ctx.drawImage(img, sx, sy, drawSize, drawSize)
    } else {
      // 绘制低分辨率占位或半透明背景
      drawTilePlaceholder(ctx, sx, sy, drawSize, tile)
      // 加入加载队列
      const dist = Math.hypot(sx + drawSize / 2 - centerX, sy + drawSize / 2 - centerY)
      loadingQueue.push({ ...tile, priority: 1000 - dist })
    }
  }

  // 提交瓦片加载请求
  for (const item of loadingQueue) {
    enqueueTileLoad(item.level, item.x, item.y, item.priority)
  }

  const gridSpacing = TILE_SIZE * waterfallViewport.value.scale
  const offsetX = -(waterfallViewport.value.x * waterfallViewport.value.scale) % gridSpacing
  const offsetY = -(waterfallViewport.value.y * waterfallViewport.value.scale) % gridSpacing

  ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)'
  ctx.lineWidth = 0.5

  for (let x = offsetX; x < plotWidth; x += gridSpacing) {
    ctx.beginPath()
    ctx.moveTo(paddingLeft + x, paddingTop)
    ctx.lineTo(paddingLeft + x, paddingTop + plotHeight)
    ctx.stroke()
  }

  for (let y = offsetY; y < plotHeight; y += gridSpacing) {
    ctx.beginPath()
    ctx.moveTo(paddingLeft, paddingTop + y)
    ctx.lineTo(width - paddingRight, paddingTop + y)
    ctx.stroke()
  }

  ctx.restore()

  drawWaterfallAxes(ctx, width, height)
  ctx.restore()
}

function drawWaterfallAxes(ctx, width, height) {
  const paddingLeft = 60
  const paddingBottom = 30
  const paddingRight = 55
  const paddingTop = 8
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingBottom - paddingTop

  ctx.fillStyle = '#8ab4c7'
  ctx.font = '11px monospace'

  ctx.strokeStyle = '#3a6b9c'
  ctx.lineWidth = 1

  // X轴底线
  ctx.beginPath()
  ctx.moveTo(paddingLeft, paddingTop + plotHeight)
  ctx.lineTo(width - paddingRight, paddingTop + plotHeight)
  ctx.stroke()

  // X轴标签：均匀分布，首尾标签使用左右对齐避免溢出
  const xTickCount = Math.min(10, Math.max(4, Math.floor(plotWidth / 60)))
  for (let i = 0; i <= xTickCount; i++) {
    const plotX = (plotWidth / xTickCount) * i
    const x = paddingLeft + plotX
    const worldX = waterfallViewport.value.x + plotX / waterfallViewport.value.scale
    const freqRatio = Math.max(0, Math.min(1, worldX / worldWidth))
    const freq = WORLD_FREQ_START + freqRatio * (WORLD_FREQ_END - WORLD_FREQ_START)

    if (i === 0) {
      ctx.textAlign = 'left'
      ctx.fillText((freq / 1e6).toFixed(0), paddingLeft + 2, height - 8)
    } else if (i === xTickCount) {
      ctx.textAlign = 'right'
      ctx.fillText((freq / 1e6).toFixed(0), width - paddingRight - 2, height - 8)
    } else {
      ctx.textAlign = 'center'
      ctx.fillText((freq / 1e6).toFixed(0), x, height - 8)
    }
  }
  ctx.textAlign = 'center'
  ctx.fillText('频率 (MHz)', paddingLeft + plotWidth / 2, height)

  // Y轴线
  ctx.beginPath()
  ctx.moveTo(paddingLeft, paddingTop)
  ctx.lineTo(paddingLeft, paddingTop + plotHeight)
  ctx.stroke()

  // Y轴标签：动态计算标签数量避免重叠
  const labelHeight = 14
  const maxLabels = Math.max(2, Math.floor(plotHeight / (labelHeight * 1.5)))
  const yTickCount = Math.min(6, maxLabels)

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < yTickCount; i++) {
    const y = paddingTop + (plotHeight / (yTickCount - 1)) * i
    const worldY = waterfallViewport.value.y + (y - paddingTop) / waterfallViewport.value.scale
    const timeRatio = Math.max(0, Math.min(1, worldY / worldHeight))
    const time = WORLD_TIME_START + timeRatio * (WORLD_TIME_END - WORLD_TIME_START)
    const date = new Date(time)
    ctx.fillText(date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), paddingLeft - 6, y)
  }
  ctx.textBaseline = 'alphabetic'

  // Y轴名称
  ctx.save()
  ctx.translate(16, paddingTop + plotHeight / 2)
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

function drawTilePlaceholder(ctx, x, y, size, tile) {
  // 根据瓦片坐标生成稳定的伪随机颜色，避免闪烁
  const seed = tile.x * 73856093 + tile.y * 19349663 + tile.level * 83492791
  const rnd = ((seed * 9301 + 49297) % 233280) / 233280

  const hue = 220 + rnd * 20
  const lightness = 5 + rnd * 8
  ctx.fillStyle = `hsl(${hue}, 40%, ${lightness}%)`
  ctx.fillRect(x, y, size, size)

  // 加载中指示
  ctx.strokeStyle = 'rgba(100, 130, 160, 0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
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
  const paddingTop = 8
  const paddingRight = 55
  const paddingBottom = 30

  if (x < paddingLeft || x > rect.width - paddingRight ||
      y < paddingTop || y > rect.height - paddingBottom) return

  waterfallInteraction.isDragging = true
  waterfallInteraction.isBoxSelecting = true
  waterfallInteraction.dragStartX = e.clientX
  waterfallInteraction.dragStartY = e.clientY
  waterfallInteraction.viewStartX = waterfallViewport.value.x
  waterfallInteraction.viewStartY = waterfallViewport.value.y

  isWaterfallBoxSelecting.value = true
  waterfallBoxSelectionPersist.value = false
  waterfallBoxSelectionInfo.value.visible = false
  waterfallBoxSelection.value = { startX: x - paddingLeft, startY: y - paddingTop, endX: x - paddingLeft, endY: y - paddingTop }

  canvas.style.cursor = 'crosshair'
}

function onWaterfallMouseMove(e) {
  const canvas = waterfallCanvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  const paddingLeft = 60
  const paddingTop = 8
  const paddingRight = 55
  const paddingBottom = 30
  const maxPlotX = rect.width - paddingLeft - paddingRight
  const maxPlotY = rect.height - paddingTop - paddingBottom

  if (waterfallInteraction.isDragging && waterfallInteraction.isBoxSelecting) {
    const plotX = Math.max(0, Math.min(maxPlotX, x - paddingLeft))
    const plotY = Math.max(0, Math.min(maxPlotY, y - paddingTop))
    waterfallBoxSelection.value.endX = plotX
    waterfallBoxSelection.value.endY = plotY
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
      const paddingTop = 8
      // 框选坐标是相对于绘图区域的，需要加回padding得到原始canvas坐标
      const worldStart = pixelToWorld(minX + paddingLeft, minY + paddingTop)
      const worldEnd = pixelToWorld(maxX + paddingLeft, maxY + paddingTop)

      const freqStartRatio = Math.max(0, Math.min(1, worldStart.x / worldWidth))
      const freqEndRatio = Math.max(0, Math.min(1, worldEnd.x / worldWidth))
      const timeStartRatio = Math.max(0, Math.min(1, worldStart.y / worldHeight))
      const timeEndRatio = Math.max(0, Math.min(1, worldEnd.y / worldHeight))

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

let wheelTimeout = null
let accumulatedDelta = 0

function onWaterfallWheel(e) {
  e.preventDefault()

  const canvas = waterfallCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top

  const paddingLeft = 60
  const paddingTop = 8
  const paddingRight = 55
  const paddingBottom = 30

  if (px < paddingLeft || px > rect.width - paddingRight ||
      py < paddingTop || py > rect.height - paddingBottom) return

  accumulatedDelta += e.deltaY

  const zoomFactor = e.deltaY < 0 ? 0.85 : 1.15
  const worldPosBefore = pixelToWorld(px, py)

  const newScale = Math.max(
    getMinScale(),
    Math.min(10, waterfallViewport.value.scale / zoomFactor)
  )

  waterfallViewport.value.scale = newScale
  const worldPosAfter = pixelToWorld(px, py)
  waterfallViewport.value.x += worldPosBefore.x - worldPosAfter.x
  waterfallViewport.value.y += worldPosBefore.y - worldPosAfter.y

  clampWaterfallViewport()
  scheduleWaterfallRender()

  // 缩放停止后，延迟切换到合适的瓦片层级
  if (wheelTimeout) clearTimeout(wheelTimeout)
  wheelTimeout = setTimeout(() => {
    const optimalLevel = getOptimalLevel()
    if (optimalLevel !== currentLevel.value) {
      smoothChangeLevel(optimalLevel)
    }
    accumulatedDelta = 0
  }, 150)
}

function getMinScale() {
  const effectiveWidth = Math.max(100, waterfallViewport.value.width - 60 - 55)
  const effectiveHeight = Math.max(100, waterfallViewport.value.height - 8 - 30)
  return Math.min(effectiveWidth / worldWidth, effectiveHeight / worldHeight)
}

function getOptimalLevel() {
  const tilesNeededX = Math.ceil((waterfallViewport.value.width - 60 - 55) / TILE_SIZE / waterfallViewport.value.scale)
  const idealTiles = Math.min(tilesNeededX, Math.pow(2, MAX_LEVEL + 1))
  const level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.ceil(Math.log2(idealTiles)) - 1))
  return level
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
  const effectiveWidth = Math.max(100, waterfallViewport.value.width - 60 - 55)
  const effectiveHeight = Math.max(100, waterfallViewport.value.height - 8 - 30)
  waterfallViewport.value.scale = Math.min(effectiveWidth / viewWidth, effectiveHeight / viewHeight)

  waterfallBoxSelectionInfo.value.visible = false
  waterfallBoxSelectionPersist.value = false

  drawSpectrum()
  scheduleWaterfallRender()
}

function cancelWaterfallBoxSelection() {
  waterfallBoxSelectionInfo.value.visible = false
  waterfallBoxSelectionPersist.value = false
}

function smoothChangeLevel(newLevel) {
  const oldLevel = currentLevel.value
  if (newLevel === oldLevel) return

  const canvas = waterfallCanvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const paddingLeft = 60
  const paddingTop = 8

  // 以视图中心为缩放中心
  const centerX = paddingLeft + (rect.width - 60 - 55) / 2
  const centerY = paddingTop + (rect.height - 8 - 30) / 2
  const centerWorld = pixelToWorld(centerX, centerY)

  currentLevel.value = newLevel

  const worldSize = getWorldSize(newLevel)
  worldWidth = worldSize.width
  worldHeight = worldSize.height

  // 保持当前显示范围尽可能一致
  const oldWorldSize = getWorldSize(oldLevel)
  const scaleRatio = oldWorldSize.width / worldSize.width
  waterfallViewport.value.scale = waterfallViewport.value.scale * scaleRatio

  waterfallViewport.value.x = centerWorld.x - (centerX - paddingLeft) / waterfallViewport.value.scale
  waterfallViewport.value.y = centerWorld.y - (centerY - paddingTop) / waterfallViewport.value.scale

  clampWaterfallViewport()
  clearTileQueue()
  tileCache.clear()
  scheduleWaterfallRender()
}

function clampWaterfallViewport() {
  const effectiveWidth = Math.max(100, waterfallViewport.value.width - 60 - 55)
  const effectiveHeight = Math.max(100, waterfallViewport.value.height - 8 - 30)

  const maxX = worldWidth - effectiveWidth / waterfallViewport.value.scale
  const maxY = worldHeight - effectiveHeight / waterfallViewport.value.scale

  waterfallViewport.value.x = Math.max(0, Math.min(waterfallViewport.value.x, maxX))
  waterfallViewport.value.y = Math.max(0, Math.min(waterfallViewport.value.y, maxY))

  const minScale = Math.min(effectiveWidth / worldWidth, effectiveHeight / worldHeight)
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
function handleQuery() {
  const freqStart = queryParams.value.freqStart * 1e6
  const freqEnd = queryParams.value.freqEnd * 1e6
  const timeStart = queryParams.value.timeStart
  const timeEnd = queryParams.value.timeEnd

  if (freqStart >= freqEnd) {
    ElMessage.error('频率起始值必须小于结束值')
    return
  }
  if (timeStart >= timeEnd) {
    ElMessage.error('时间起始值必须小于结束值')
    return
  }

  spectrumViewport.value.freqStart = freqStart
  spectrumViewport.value.freqEnd = freqEnd

  const freqRatio = (freqStart - WORLD_FREQ_START) / (WORLD_FREQ_END - WORLD_FREQ_START)
  const freqEndRatio = (freqEnd - WORLD_FREQ_START) / (WORLD_FREQ_END - WORLD_FREQ_START)

  waterfallViewport.value.x = freqRatio * worldWidth
  const viewWidth = (freqEndRatio - freqRatio) * worldWidth
  const effectiveWidth = Math.max(100, waterfallViewport.value.width - 60 - 55)
  waterfallViewport.value.scale = effectiveWidth / Math.max(1, viewWidth)

  clearTileQueue()
  tileCache.clear()
  drawSpectrum()
  scheduleWaterfallRender()

  ElMessage.success('查询完成')
}

function resetQuery() {
  queryParams.value = {
    freqStart: 900,
    freqEnd: 1100,
    timeStart: Date.now() - 3600 * 1000,
    timeEnd: Date.now()
  }
  resetView()
}

function resetView() {
  currentLevel.value = MIN_LEVEL
  const worldSize = getWorldSize(MIN_LEVEL)
  worldWidth = worldSize.width
  worldHeight = worldSize.height

  waterfallViewport.value.x = 0
  waterfallViewport.value.y = 0
  const effectiveWidth = Math.max(100, waterfallViewport.value.width - 60 - 55)
  waterfallViewport.value.scale = effectiveWidth / worldWidth

  spectrumViewport.value = {
    freqStart: WORLD_FREQ_START,
    freqEnd: WORLD_FREQ_END,
    refLevel: 0,
    minLevel: -100
  }

  clearTileQueue()
  tileCache.clear()
  drawSpectrum()
  scheduleWaterfallRender()
}

function clearTileQueue() {
  pendingTiles.length = 0
  if (tileLoadFrame) {
    cancelAnimationFrame(tileLoadFrame)
    tileLoadFrame = null
  }
}

function zoomIn() {
  if (currentLevel.value < MAX_LEVEL) {
    smoothChangeLevel(currentLevel.value + 1)
  }
}

function zoomOut() {
  if (currentLevel.value > MIN_LEVEL) {
    smoothChangeLevel(currentLevel.value - 1)
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
    const cbW = 18
    const cbH = Math.max(50, (waterfallArea?.clientHeight || 200) - 8 - 30)
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
    const paddingLeft = 60
    const paddingRight = 55
    const effectiveWidth = Math.max(100, waterfallViewport.value.width - paddingLeft - paddingRight)
    waterfallViewport.value.scale = effectiveWidth / worldWidth
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

.query-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: #0d1f35;
  border-bottom: 1px solid #1e4976;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 40px;
}

.query-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.query-label {
  font-size: 12px;
  color: #8ab4c7;
  white-space: nowrap;
}

.query-input {
  width: 90px;
}

.query-separator {
  color: #8ab4c7;
}

.toolbar {
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: #0d1f35;
  border-bottom: 1px solid #1e4976;
  gap: 10px;
  min-height: 36px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.level-info {
  margin-left: 12px;
  font-family: monospace;
  color: #8ab4c7;
  font-size: 12px;
}

.hover-info {
  font-family: monospace;
  color: #8ab4c7;
  font-size: 12px;
}

.spectrum-area {
  position: relative;
  flex: 1 1 35%;
  min-height: 160px;
  max-height: 45%;
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
  flex: 1 1 55%;
  min-height: 180px;
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
  right: 8px;
  top: 8px;
  bottom: 30px;
  width: 44px;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  z-index: 50;
  background: rgba(10, 22, 40, 0.9);
  border: 1px solid #1e4976;
  border-radius: 4px;
  padding: 3px;
  box-sizing: border-box;
}

.color-bar-canvas {
  flex: 0 0 16px;
  height: 100%;
  display: block;
}

.color-bar-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding-left: 3px;
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 9px;
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