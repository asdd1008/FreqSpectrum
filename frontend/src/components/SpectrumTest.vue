<template>
  <div class="spectrum-test-page">
    <div class="page-header">
      <h2>新频谱组件测试</h2>
      <div class="header-info">
        <span>中心频率: {{ formatFreq(config.centerFreq) }}</span>
        <span>带宽: {{ formatFreq(config.span) }}</span>
        <span>参考电平: {{ config.refLevel }} dBm</span>
      </div>
      <div class="header-buttons">
        <button @click="togglePause">{{ isPaused ? '播放' : '暂停' }}</button>
        <button @click="resetZoom">重置缩放</button>
        <button @click="clearWaterfall">清空瀑布图</button>
        <button @click="addTestMarker">添加标记</button>
      </div>
    </div>
    
    <div class="spectrum-container">
      <Spectrum
        ref="spectrumRef"
        :config="config"
        :markers="markers"
        @ready="handleReady"
        @click="handleClick"
        @doubleClick="handleDoubleClick"
        @markerClick="handleMarkerClick"
        @hover="handleHover"
        @zoomChange="handleZoomChange"
        @fallsSelect="handleFallsSelect"
        @playbackFrame="handlePlaybackFrame"
        @pause="handlePause"
        @play="handlePlay"
      />
    </div>
    
    <div class="info-panel">
      <div class="info-item">
        <label>鼠标位置:</label>
        <span v-if="hoverInfo">
          {{ formatFreq(hoverInfo.freq) }} / {{ hoverInfo.level?.toFixed(2) }} dBm
        </span>
        <span v-else>--</span>
      </div>
      <div class="info-item">
        <label>ZoomX:</label>
        <span>[{{ config.zoomX[0].toFixed(3) }}, {{ config.zoomX[1].toFixed(3) }}]</span>
      </div>
      <div class="info-item">
        <label>ZoomY:</label>
        <span>[{{ config.zoomY[0].toFixed(3) }}, {{ config.zoomY[1].toFixed(3) }}]</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import Spectrum from './Spectrum/spectrum.vue'

const spectrumRef = ref(null)

const config = reactive({
  centerFreq: 1000000000,
  span: 100000000,
  refLevel: 0,
  minLevel: -100,
  waterfallHeight: 200,
  waterfallVisible: true,
  zoomX: [0, 1],
  zoomY: [0, 1],
  maxHold: true,
  minHold: false,
  avgHold: false
})

const markers = ref([
  { id: 1, freq: 980000000, color: '#ffeb3b' },
  { id: 2, freq: 1020000000, color: '#4dd2ff' }
])

const hoverInfo = ref(null)
const isPaused = ref(false)
let dataTimer = null

function handleReady(data) {
  console.log('Spectrum ready:', data)
  startDataSimulation()
}

function handleClick(data) {
  console.log('Click:', data)
}

function handleDoubleClick(data) {
  console.log('DoubleClick:', data)
  const newMarker = {
    id: Date.now(),
    freq: data.freq,
    color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
  }
  spectrumRef.value?.addMarker(newMarker)
}

function handleMarkerClick(data) {
  console.log('MarkerClick:', data)
}

function handleHover(data) {
  hoverInfo.value = data
}

function handleZoomChange(data) {
  config.zoomX = data.zoomX
  config.zoomY = data.zoomY
}

function handleFallsSelect(data) {
  console.log('FallsSelect:', data)
  spectrumRef.value?.fallsSelectPlayBack(data)
}

function handlePlaybackFrame(data) {
}

function handlePause() {
  isPaused.value = true
}

function handlePlay() {
  isPaused.value = false
}

function togglePause() {
  if (isPaused.value) {
    spectrumRef.value?.play()
  } else {
    spectrumRef.value?.pause()
  }
}

function resetZoom() {
  spectrumRef.value?.resetZoom()
}

function clearWaterfall() {
  spectrumRef.value?.clearWaterfall()
}

function addTestMarker() {
  const freq = config.centerFreq + (Math.random() - 0.5) * config.span
  const newMarker = {
    id: Date.now(),
    freq,
    color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
  }
  spectrumRef.value?.addMarker(newMarker)
}

function generateSpectrumData() {
  const points = 1000
  const data = new Float32Array(points)
  
  for (let i = 0; i < points; i++) {
    const ratio = i / points
    let level = -80 + Math.random() * 10
    
    const peakFreqs = [0.2, 0.35, 0.5, 0.65, 0.8]
    peakFreqs.forEach(pf => {
      const dist = Math.abs(ratio - pf)
      if (dist < 0.05) {
        const peakLevel = -10 + Math.random() * 5
        const falloff = 1 - dist / 0.05
        level = Math.max(level, peakLevel * falloff + -80 * (1 - falloff))
      }
    })
    
    const wideBand = Math.sin(ratio * Math.PI * 3) * 20 - 30
    level = Math.max(level, wideBand + Math.random() * 5)
    
    data[i] = level
  }
  
  return data
}

function startDataSimulation() {
  if (dataTimer) return
  
  dataTimer = setInterval(() => {
    if (isPaused.value) return
    
    const data = generateSpectrumData()
    spectrumRef.value?.addData(data)
  }, 100)
}

function stopDataSimulation() {
  if (dataTimer) {
    clearInterval(dataTimer)
    dataTimer = null
  }
}

function formatFreq(freq) {
  if (freq >= 1e9) return `${(freq / 1e9).toFixed(3)} GHz`
  if (freq >= 1e6) return `${(freq / 1e6).toFixed(3)} MHz`
  if (freq >= 1e3) return `${(freq / 1e3).toFixed(3)} kHz`
  return `${freq.toFixed(0)} Hz`
}

onMounted(() => {
})

onBeforeUnmount(() => {
  stopDataSimulation()
})
</script>

<style scoped>
.spectrum-test-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #001226;
  color: #cce0ff;
  padding: 10px;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 15px;
  background: rgba(0, 50, 100, 0.3);
  border: 1px solid rgba(100, 150, 200, 0.3);
  border-radius: 4px;
  margin-bottom: 10px;
}

.page-header h2 {
  margin: 0;
  font-size: 16px;
  color: #66b3ff;
}

.header-info {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #99c2ff;
}

.header-buttons {
  display: flex;
  gap: 8px;
}

.header-buttons button {
  padding: 5px 12px;
  background: rgba(0, 100, 200, 0.4);
  border: 1px solid rgba(100, 150, 200, 0.5);
  border-radius: 3px;
  color: #cce0ff;
  cursor: pointer;
  font-size: 12px;
}

.header-buttons button:hover {
  background: rgba(0, 150, 255, 0.5);
}

.spectrum-container {
  flex: 1;
  min-height: 500px;
  border: 1px solid rgba(100, 150, 200, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.info-panel {
  display: flex;
  gap: 30px;
  padding: 8px 15px;
  margin-top: 10px;
  background: rgba(0, 50, 100, 0.2);
  border-radius: 4px;
  font-size: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item label {
  color: #6699cc;
}

.info-item span {
  color: #cce0ff;
  font-family: monospace;
}
</style>
