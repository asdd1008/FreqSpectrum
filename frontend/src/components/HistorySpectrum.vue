<template>
  <div class="history-spectrum-container">
    <!-- 顶部工具栏 -->
    <div class="history-toolbar">
      <div class="toolbar-left">
        <el-button-group>
          <el-button
            size="small"
            :type="zoomMode === 'level' ? 'primary' : 'default'"
            @click="zoomMode = 'level'"
          >
            <el-icon><ZoomIn /></el-icon>
            等级缩放
          </el-button>
          <el-button
            size="small"
            :type="zoomMode === 'continuous' ? 'primary' : 'default'"
            @click="zoomMode = 'continuous'"
          >
            <el-icon><ScaleToOriginal /></el-icon>
            连续缩放
          </el-button>
        </el-button-group>

        <el-divider direction="vertical" />

        <!-- 时间范围选择 -->
        <el-date-picker
          v-model="timeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          size="small"
          style="width: 320px"
          @change="onTimeRangeChange"
        />

        <el-button size="small" type="primary" @click="loadHistoryData">
          <el-icon><Search /></el-icon>
          加载数据
        </el-button>
      </div>

      <div class="toolbar-right">
        <span class="zoom-info">
          缩放等级: {{ currentZoomLevel }} | 
          频率范围: {{ formatFreq(viewport.freqStart) }} ~ {{ formatFreq(viewport.freqEnd) }} | 
          时间范围: {{ formatTime(viewport.timeStart) }} ~ {{ formatTime(viewport.timeEnd) }}
        </span>
      </div>
    </div>

    <!-- 主显示区域 -->
    <div class="history-display-area" ref="displayAreaRef">
      <!-- 频谱图区域 -->
      <div class="spectrum-image-area" ref="spectrumAreaRef">
        <canvas ref="spectrumCanvasRef" class="spectrum-canvas"></canvas>
        <!-- 轴标签 -->
        <div class="axis-label x-axis-label">频率 (MHz)</div>
        <div class="axis-label y-axis-label left">时间</div>
        <div class="axis-label y-axis-label right">dBm</div>
      </div>

      <!-- 瀑布图区域 -->
      <div class="waterfall-area" ref="waterfallAreaRef">
        <canvas ref="waterfallCanvasRef" class="waterfall-canvas"></canvas>
      </div>
    </div>

    <!-- 底部信息栏 -->
    <div class="history-info-bar">
      <span>当前位置: 频率={{ formatFreq(mouseInfo.freq) }}, 时间={{ formatTime(mouseInfo.time) }}, dBm={{ mouseInfo.level?.toFixed(2) ?? '--' }}</span>
      <span> | 会话ID: {{ currentSessionId ?? '--' }}</span>
      <span> | 鼠标坐标: ({{ mouseInfo.x?.toFixed(0) ?? '--' }}, {{ mouseInfo.y?.toFixed(0) ?? '--' }})</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { ZoomIn, ScaleToOriginal, Search } from '@element-plus/icons-vue'
import { formatFreq } from '../utils/spectrumUtils.js'

// ==================== 状态定义 ====================

const displayAreaRef = ref(null)
const spectrumAreaRef = ref(null)
const spectrumCanvasRef = ref(null)
const waterfallAreaRef = ref(null)
const waterfallCanvasRef = ref(null)

// 缩放模式: 'level'(固定等级,默认) | 'continuous'(连续缩放)
const zoomMode = ref('level')

// 当前缩放等级 (固定等级模式: 0=全览, 1, 2, 3, 4=最大细节)
const currentZoomLevel = ref(0)
const MAX_ZOOM_LEVEL = 4

// 视口范围
const viewport = reactive({
  freqStart: 900e6,   // Hz
  freqEnd: 1100e6,    // Hz
  timeStart: 0,       // timestamp ms
  timeEnd: 0,         // timestamp ms
  levelMin: -100,     // dBm
  levelMax: 0         // dBm
})

// 时间范围选择
const timeRange = ref([])

// 当前会话ID
const currentSessionId = ref(null)

// 鼠标信息
const mouseInfo = reactive({
  x: 0,
  y: 0,
  freq: 0,
  time: 0,
  level: null
})

// 图片瓦片缓存
const tileCache = reactive(new Map())

// 频谱Canvas上下文
let spectrumCtx = null
let waterfallCtx = null

// ==================== 生命周期 ====================

onMounted(() => {
  nextTick(() => {
    initCanvas()
    bindEvents()
    // 默认加载最近1小时的数据
    const now = Date.now()
    timeRange.value = [new Date(now - 3600 * 1000), new Date(now)]
    loadHistoryData()
  })
})

onUnmounted(() => {
  unbindEvents()
})

// ==================== Canvas初始化 ====================

function initCanvas() {
  const spectrumCanvas = spectrumCanvasRef.value
  const waterfallCanvas = waterfallCanvasRef.value
  if (!spectrumCanvas || !waterfallCanvas) return

  const dpr = window.devicePixelRatio || 1

  // 频谱图Canvas
  const spectrumArea = spectrumAreaRef.value
  const sW = spectrumArea.clientWidth
  const sH = spectrumArea.clientHeight
  spectrumCanvas.width = sW * dpr
  spectrumCanvas.height = sH * dpr
  spectrumCanvas.style.width = sW + 'px'
  spectrumCanvas.style.height = sH + 'px'
  spectrumCtx = spectrumCanvas.getContext('2d')
  spectrumCtx.scale(dpr, dpr)

  // 瀑布图Canvas
  const waterfallArea = waterfallAreaRef.value
  const wW = waterfallArea.clientWidth
  const wH = waterfallArea.clientHeight
  waterfallCanvas.width = wW * dpr
  waterfallCanvas.height = wH * dpr
  waterfallCanvas.style.width = wW + 'px'
  waterfallCanvas.style.height = wH + 'px'
  waterfallCtx = waterfallCanvas.getContext('2d')
  waterfallCtx.scale(dpr, dpr)

  // 初始绘制底座
  drawBaseFrame()
}

// ==================== 事件绑定 ====================

function bindEvents() {
  const spectrumCanvas = spectrumCanvasRef.value
  if (!spectrumCanvas) return

  spectrumCanvas.addEventListener('wheel', onWheel, { passive: false })
  spectrumCanvas.addEventListener('mousemove', onMouseMove)
  spectrumCanvas.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('resize', onResize)
}

function unbindEvents() {
  const spectrumCanvas = spectrumCanvasRef.value
  if (!spectrumCanvas) return

  spectrumCanvas.removeEventListener('wheel', onWheel)
  spectrumCanvas.removeEventListener('mousemove', onMouseMove)
  spectrumCanvas.removeEventListener('mouseleave', onMouseLeave)
  window.removeEventListener('resize', onResize)
}

// ==================== 渲染底座 ====================

function drawBaseFrame() {
  if (!spectrumCtx) return
  const canvas = spectrumCanvasRef.value
  const width = Math.floor(canvas.width / (window.devicePixelRatio || 1))
  const height = Math.floor(canvas.height / (window.devicePixelRatio || 1))

  if (width <= 0 || height <= 0) return

  // 清空
  spectrumCtx.clearRect(0, 0, width, height)

  // 背景
  spectrumCtx.fillStyle = '#0a1628'
  spectrumCtx.fillRect(0, 0, width, height)

  // 绘制网格
  drawGrid(width, height)

  // 绘制轴
  drawAxes(width, height)
}

function drawGrid(width, height) {
  const gridColor = '#1a3a5c'
  spectrumCtx.strokeStyle = gridColor
  spectrumCtx.lineWidth = 0.5

  // 垂直网格线 (频率)
  const freqSteps = 10
  for (let i = 0; i <= freqSteps; i++) {
    const x = (width / freqSteps) * i
    spectrumCtx.beginPath()
    spectrumCtx.moveTo(x, 0)
    spectrumCtx.lineTo(x, height)
    spectrumCtx.stroke()
  }

  // 水平网格线
  const timeSteps = 8
  for (let i = 0; i <= timeSteps; i++) {
    const y = (height / timeSteps) * i
    spectrumCtx.beginPath()
    spectrumCtx.moveTo(0, y)
    spectrumCtx.lineTo(width, y)
    spectrumCtx.stroke()
  }
}

function drawAxes(width, height) {
  const axisColor = '#3a6b9c'
  spectrumCtx.strokeStyle = axisColor
  spectrumCtx.lineWidth = 1.5
  spectrumCtx.fillStyle = '#e0e0e0'
  spectrumCtx.font = '12px monospace'
  spectrumCtx.textAlign = 'center'

  // X轴 (底部)
  spectrumCtx.beginPath()
  spectrumCtx.moveTo(0, height)
  spectrumCtx.lineTo(width, height)
  spectrumCtx.stroke()

  // X轴刻度标签 (频率)
  const freqSteps = 10
  for (let i = 0; i <= freqSteps; i++) {
    const x = (width / freqSteps) * i
    const freq = viewport.freqStart + (viewport.freqEnd - viewport.freqStart) * (i / freqSteps)
    spectrumCtx.fillText((freq / 1e6).toFixed(0), x, height - 5)
  }

  // Y轴左侧 (时间)
  spectrumCtx.beginPath()
  spectrumCtx.moveTo(0, 0)
  spectrumCtx.lineTo(0, height)
  spectrumCtx.stroke()

  spectrumCtx.textAlign = 'right'
  const timeSteps = 8
  for (let i = 0; i <= timeSteps; i++) {
    const y = (height / timeSteps) * i
    const time = viewport.timeStart + (viewport.timeEnd - viewport.timeStart) * (i / timeSteps)
    spectrumCtx.fillText(formatTimeShort(time), 55, y + 4)
  }

  // Y轴右侧 (dBm)
  spectrumCtx.beginPath()
  spectrumCtx.moveTo(width, 0)
  spectrumCtx.lineTo(width, height)
  spectrumCtx.stroke()

  spectrumCtx.textAlign = 'left'
  const levelSteps = 8
  for (let i = 0; i <= levelSteps; i++) {
    const y = (height / levelSteps) * i
    const level = viewport.levelMin + (viewport.levelMax - viewport.levelMin) * (1 - i / levelSteps)
    spectrumCtx.fillText(level.toFixed(0) + ' dBm', width + 5, y + 4)
  }
}

// ==================== 图片瓦片加载 ====================

async function loadTiles() {
  // 计算需要加载的瓦片范围
  const canvas = spectrumCanvasRef.value
  if (!canvas) return

  const width = canvas.width / (window.devicePixelRatio || 1)
  const height = canvas.height / (window.devicePixelRatio || 1)

  // 瓦片大小
  const TILE_SIZE = 256

  // 计算瓦片行列数
  const cols = Math.ceil(width / TILE_SIZE)
  const rows = Math.ceil(height / TILE_SIZE)

  // 计算每个瓦片对应的频率和时间范围
  const freqRange = viewport.freqEnd - viewport.freqStart
  const timeRange = viewport.timeEnd - viewport.timeStart

  const tilesToLoad = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tileFreqStart = viewport.freqStart + (freqRange / cols) * col
      const tileFreqEnd = viewport.freqStart + (freqRange / cols) * (col + 1)
      const tileTimeStart = viewport.timeStart + (timeRange / rows) * row
      const tileTimeEnd = viewport.timeStart + (timeRange / rows) * (row + 1)

      const tileKey = `${currentZoomLevel.value}_${col}_${row}`

      if (!tileCache.has(tileKey)) {
        tilesToLoad.push({
          key: tileKey,
          col,
          row,
          freqStart: tileFreqStart,
          freqEnd: tileFreqEnd,
          timeStart: tileTimeStart,
          timeEnd: tileTimeEnd
        })
      }
    }
  }

  // 加载瓦片
  for (const tile of tilesToLoad) {
    await loadTile(tile)
  }

  // 绘制所有瓦片
  drawTiles()
}

async function loadTile(tile) {
  try {
    // 构建请求参数
    const params = new URLSearchParams({
      level: currentZoomLevel.value.toString(),
      x: tile.col.toString(),
      y: tile.row.toString(),
      freqStart: tile.freqStart.toString(),
      freqEnd: tile.freqEnd.toString(),
      timeStart: tile.timeStart.toString(),
      timeEnd: tile.timeEnd.toString(),
      sessionId: currentSessionId.value || ''
    })

    // 请求后端图片
    const response = await fetch(`/api/history/tile?${params}`)
    if (!response.ok) {
      // 如果后端不可用，生成占位图片
      createPlaceholderTile(tile)
      return
    }

    const blob = await response.blob()
    const img = new Image()
    img.onload = () => {
      tileCache.set(tile.key, { image: img, ...tile })
      drawTiles()
    }
    img.src = URL.createObjectURL(blob)
  } catch (err) {
    // 后端不可用，生成占位图片
    createPlaceholderTile(tile)
  }
}

function createPlaceholderTile(tile) {
  // 生成模拟的频谱图片数据
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')

  // 绘制模拟频谱
  const imageData = ctx.createImageData(256, 256)
  const data = imageData.data

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4
      // 模拟频谱数据：频率从左到右，时间从上到下
      const freqRatio = x / 256
      const timeRatio = y / 256

      // 模拟一些信号
      let value = 0.1 // 噪声底

      // CW信号
      if (Math.abs(freqRatio - 0.3) < 0.05) value = 0.8
      if (Math.abs(freqRatio - 0.7) < 0.03) value = 0.9

      // 随时间变化
      value += Math.sin(timeRatio * Math.PI * 4) * 0.1

      // 颜色映射 (蓝->绿->黄->红)
      const [r, g, b] = getHeatmapColor(value)
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)

  const img = new Image()
  img.onload = () => {
    tileCache.set(tile.key, { image: img, ...tile })
    drawTiles()
  }
  img.src = canvas.toDataURL()
}

function getHeatmapColor(value) {
  const clamped = Math.max(0, Math.min(1, value))
  if (clamped < 0.25) {
    const t = clamped / 0.25
    return [0, 0, Math.floor(t * 255)]
  } else if (clamped < 0.5) {
    const t = (clamped - 0.25) / 0.25
    return [0, Math.floor(t * 255), 255]
  } else if (clamped < 0.75) {
    const t = (clamped - 0.5) / 0.25
    return [Math.floor(t * 255), 255, Math.floor(255 * (1 - t))]
  } else {
    const t = (clamped - 0.75) / 0.25
    return [255, Math.floor(255 * (1 - t)), 0]
  }
}

function drawTiles() {
  if (!spectrumCtx) return
  const canvas = spectrumCanvasRef.value
  const width = canvas.width / (window.devicePixelRatio || 1)
  const height = canvas.height / (window.devicePixelRatio || 1)

  // 先绘制底座
  drawBaseFrame()

  // 绘制瓦片
  const TILE_SIZE = 256

  for (const [key, tile] of tileCache) {
    if (tile.image) {
      const x = tile.col * TILE_SIZE
      const y = tile.row * TILE_SIZE
      spectrumCtx.drawImage(tile.image, x, y, TILE_SIZE, TILE_SIZE)
    }
  }
}

// ==================== 瀑布图渲染 ====================

function drawWaterfall() {
  if (!waterfallCtx) return
  const canvas = waterfallCanvasRef.value
  const width = Math.floor(canvas.width / (window.devicePixelRatio || 1))
  const height = Math.floor(canvas.height / (window.devicePixelRatio || 1))

  if (width <= 0 || height <= 0) return

  waterfallCtx.clearRect(0, 0, width, height)
  waterfallCtx.fillStyle = '#0a1628'
  waterfallCtx.fillRect(0, 0, width, height)

  // 绘制时间-频率热力图
  // 使用占位数据模拟
  const imageData = waterfallCtx.createImageData(width, height)
  const data = imageData.data

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const freqRatio = x / width
      const timeRatio = y / height

      // 模拟历史数据热力图
      let value = 0.1
      if (Math.abs(freqRatio - 0.3) < 0.05) value = 0.7
      if (Math.abs(freqRatio - 0.7) < 0.03) value = 0.85
      value += Math.sin(timeRatio * Math.PI * 8) * 0.15

      const [r, g, b] = getHeatmapColor(value)
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }

  waterfallCtx.putImageData(imageData, 0, 0)
}

// ==================== 鼠标事件 ====================

function onWheel(e) {
  e.preventDefault()

  const canvas = spectrumCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const width = rect.width
  const height = rect.height

  // 计算鼠标位置对应的数据
  const freqRatio = x / width
  const timeRatio = y / height
  const mouseFreq = viewport.freqStart + (viewport.freqEnd - viewport.freqStart) * freqRatio
  const mouseTime = viewport.timeStart + (viewport.timeEnd - viewport.timeStart) * timeRatio

  if (zoomMode.value === 'level') {
    // 固定等级模式: 滚轮切换等级
    if (e.deltaY < 0) {
      // 放大
      if (currentZoomLevel.value < MAX_ZOOM_LEVEL) {
        currentZoomLevel.value++
      }
    } else {
      // 缩小
      if (currentZoomLevel.value > 0) {
        currentZoomLevel.value--
      }
    }

    // 根据等级调整视口
    updateViewportByLevel(currentZoomLevel.value, mouseFreq, mouseTime)
  } else {
    // 连续缩放模式
    const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25
    const freqRange = viewport.freqEnd - viewport.freqStart
    const timeRange = viewport.timeEnd - viewport.timeStart

    const newFreqRange = freqRange * zoomFactor
    const newTimeRange = timeRange * zoomFactor

    // 以鼠标位置为中心缩放
    viewport.freqStart = mouseFreq - newFreqRange * freqRatio
    viewport.freqEnd = mouseFreq + newFreqRange * (1 - freqRatio)
    viewport.timeStart = mouseTime - newTimeRange * timeRatio
    viewport.timeEnd = mouseTime + newTimeRange * (1 - timeRatio)
  }

  // 清空瓦片缓存并重新加载
  tileCache.clear()
  loadTiles()
  drawWaterfall()

  // 发送缩放信息到后端
  sendZoomInfo({
    zoomLevel: currentZoomLevel.value,
    zoomMode: zoomMode.value,
    freqStart: viewport.freqStart,
    freqEnd: viewport.freqEnd,
    timeStart: viewport.timeStart,
    timeEnd: viewport.timeEnd,
    mouseFreq,
    mouseTime,
    mouseX: x,
    mouseY: y,
    sessionId: currentSessionId.value
  })
}

function onMouseMove(e) {
  const canvas = spectrumCanvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const width = rect.width
  const height = rect.height

  mouseInfo.x = x
  mouseInfo.y = y
  mouseInfo.freq = viewport.freqStart + (viewport.freqEnd - viewport.freqStart) * (x / width)
  mouseInfo.time = viewport.timeStart + (viewport.timeEnd - viewport.timeStart) * (y / height)

  // 从瓦片数据中获取该位置的dBm值（简化处理）
  // 实际应该从已加载的瓦片图片中采样
  mouseInfo.level = (Math.random() * 40 - 80) // 占位
}

function onMouseLeave() {
  mouseInfo.x = 0
  mouseInfo.y = 0
  mouseInfo.freq = 0
  mouseInfo.time = 0
  mouseInfo.level = null
}

function onResize() {
  nextTick(() => {
    initCanvas()
    tileCache.clear()
    loadTiles()
    drawWaterfall()
  })
}

// ==================== 视口管理 ====================

function updateViewportByLevel(level, centerFreq, centerTime) {
  const baseFreqRange = 200e6 // 200 MHz
  const baseTimeRange = 3600 * 1000 // 1 hour

  const factor = Math.pow(2, level)
  const freqRange = baseFreqRange / factor
  const timeRange = baseTimeRange / factor

  viewport.freqStart = centerFreq - freqRange / 2
  viewport.freqEnd = centerFreq + freqRange / 2
  viewport.timeStart = centerTime - timeRange / 2
  viewport.timeEnd = centerTime + timeRange / 2
}

// ==================== 数据加载 ====================

function onTimeRangeChange(val) {
  if (val && val.length === 2) {
    viewport.timeStart = val[0].getTime()
    viewport.timeEnd = val[1].getTime()
  }
}

async function loadHistoryData() {
  if (!timeRange.value || timeRange.value.length !== 2) {
    return
  }

  viewport.timeStart = timeRange.value[0].getTime()
  viewport.timeEnd = timeRange.value[1].getTime()

  // 向后端请求会话ID（聚合查询）
  try {
    const response = await fetch('/api/history/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeStart: viewport.timeStart,
        timeEnd: viewport.timeEnd,
        freqStart: viewport.freqStart,
        freqEnd: viewport.freqEnd
      })
    })

    if (response.ok) {
      const data = await response.json()
      currentSessionId.value = data.sessionId
      // 更新视口范围（后端可能返回实际数据范围）
      if (data.freqStart) viewport.freqStart = data.freqStart
      if (data.freqEnd) viewport.freqEnd = data.freqEnd
    }
  } catch (err) {
    console.log('Backend not available, using mock data')
    currentSessionId.value = 'mock-session-' + Date.now()
  }

  // 清空缓存并重新加载
  tileCache.clear()
  await loadTiles()
  drawWaterfall()
}

// ==================== 后端通信 ====================

function sendZoomInfo(info) {
  // 发送缩放信息到后端
  fetch('/api/history/zoom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(info)
  }).catch(err => {
    // 后端可能不可用
  })
}

// ==================== 工具函数 ====================

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

function formatTimeShort(timestamp) {
  if (!timestamp) return '--'
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.history-spectrum-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a1628;
  color: #e0e0e0;
}

.history-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #0d1f35;
  border-bottom: 1px solid #1e4976;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  font-size: 12px;
  color: #8ab4c7;
}

.zoom-info {
  font-family: monospace;
}

.history-display-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.spectrum-image-area {
  flex: 2;
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid #1e4976;
}

.spectrum-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.axis-label {
  position: absolute;
  font-size: 12px;
  color: #8ab4c7;
  pointer-events: none;
}

.x-axis-label {
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.y-axis-label {
  top: 50%;
  transform: translateY(-50%);
}

.y-axis-label.left {
  left: 2px;
}

.y-axis-label.right {
  right: 2px;
}

.waterfall-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.waterfall-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.history-info-bar {
  display: flex;
  justify-content: space-between;
  padding: 4px 16px;
  background: #0d1f35;
  border-top: 1px solid #1e4976;
  font-size: 12px;
  color: #8ab4c7;
  font-family: monospace;
}
</style>
