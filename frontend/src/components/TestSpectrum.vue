<template>
  <div class="test-page">
    <h2>三层架构测试页面</h2>
    
    <div class="test-section">
      <h3>1. Spectrum 组件（三层架构）</h3>
      <div class="spectrum-wrapper">
        <Spectrum
          ref="spectrumRef"
          :config="spectrumConfig"
          :markers="markers"
          :highlighted-signals="highlightedSignals"
          @ready="onSpectrumReady"
          @click="onClick"
          @double-click="onDoubleClick"
          @double-click-marker="onDoubleClickMarker"
          @marker-add="onMarkerAdd"
          @falls-select-complate="onFallsSelectComplate"
          @signal-highlight="onSignalHighlight"
          @pause="onPause"
          @play="onPlay"
        />
      </div>
    </div>
    
    <div class="test-controls">
      <el-button @click="addTestMarker">添加测试标记</el-button>
      <el-button @click="addTestHighlight">添加测试高亮</el-button>
      <el-button @click="clearHighlights">清除高亮</el-button>
      <el-button @click="togglePause">{{ isPaused ? '播放' : '暂停' }}</el-button>
      <el-button @click="resetZoom">重置缩放</el-button>
      <el-button @click="addRainMarker">添加语图标记</el-button>
    </div>
    
    <div class="test-info">
      <div>状态: {{ status }}</div>
      <div>点击位置: {{ clickInfo }}</div>
      <div>缩放: zoomX={{ zoomInfo.x }}, zoomY={{ zoomInfo.y }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import Spectrum from './Spectrum/spectrum.vue'

const spectrumRef = ref(null)
const isReady = ref(false)
const isPaused = ref(false)
const status = ref('初始化中...')
const clickInfo = ref('')
const zoomInfo = ref({ x: '[0,1]', y: '[0,1]' })

const spectrumConfig = ref({
  centerFreq: 1000000000,
  span: 100000000,
  refLevel: 0,
  minLevel: -100,
  waterfallHeight: 200,
  maxHold: true
})

const markers = ref([
  { id: 1, freq: 950000000, level: -30, note: '测试标记1' }
])

const highlightedSignals = ref([])

let dataTimer = null
let dataIndex = 0

const generateTestData = () => {
  const points = 1024
  const data = new Float32Array(points)
  
  for (let i = 0; i < points; i++) {
    const freqRatio = i / (points - 1)
    const baseNoise = -80 + Math.random() * 10
    const signal1 = freqRatio > 0.3 && freqRatio < 0.4 
      ? -30 + Math.random() * 5 - Math.abs(freqRatio - 0.35) * 200
      : -100
    const signal2 = freqRatio > 0.6 && freqRatio < 0.65
      ? -40 + Math.random() * 3 - Math.abs(freqRatio - 0.625) * 300
      : -100
    
    data[i] = Math.max(baseNoise, signal1, signal2)
  }
  
  return data
}

const onSpectrumReady = (instance) => {
  isReady.value = true
  status.value = '频谱组件已就绪'
  startDataStream()
}

const startDataStream = () => {
  if (dataTimer) return
  
  dataTimer = setInterval(() => {
    if (!isPaused.value && spectrumRef.value) {
      const data = generateTestData()
      spectrumRef.value.addData(data)
      dataIndex++
    }
  }, 100)
}

const stopDataStream = () => {
  if (dataTimer) {
    clearInterval(dataTimer)
    dataTimer = null
  }
}

const onClick = (data) => {
  clickInfo.value = `x=${data.x?.toFixed(0)}, y=${data.y?.toFixed(0)}, freq=${(data.freq/1e6).toFixed(2)}MHz, level=${data.level?.toFixed(2)}dBm`
}

const onDoubleClick = (data) => {
  ElMessage.info(`双击位置: ${(data.freq/1e6).toFixed(2)} MHz`)
}

const onDoubleClickMarker = (data) => {
  ElMessage.success(`双击标记: ${data.marker.id}`)
}

const onMarkerAdd = (marker) => {
  ElMessage.success(`标记已添加: ${(marker.freq/1e6).toFixed(2)} MHz`)
}

const onFallsSelectComplate = (result) => {
  ElMessage.info(`框选完成: ${(result.startFreq/1e6).toFixed(2)} - ${(result.endFreq/1e6).toFixed(2)} MHz, ${result.selectData?.length || 0} 帧`)
}

const onSignalHighlight = (signal) => {
  highlightedSignals.value.push(signal)
}

const onPause = () => {
  isPaused.value = true
  status.value = '已暂停'
}

const onPlay = () => {
  isPaused.value = false
  status.value = '播放中'
}

const addTestMarker = () => {
  if (!spectrumRef.value) return
  const freq = 900000000 + Math.random() * 200000000
  const marker = {
    id: Date.now(),
    freq,
    level: -40 + Math.random() * 20,
    note: '测试标记'
  }
  spectrumRef.value.addMarker(marker)
  markers.value.push(marker)
}

const addTestHighlight = () => {
  if (!spectrumRef.value) return
  const signal = {
    id: Date.now(),
    freq: 950000000 + Math.random() * 100000000,
    bandwidth: 10000000,
    maxLevel: -30 + Math.random() * 10,
    color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
  }
  const instance = spectrumRef.value.getInstance()
  instance?.addHighlightedSignal(signal)
  highlightedSignals.value.push(signal)
}

const clearHighlights = () => {
  if (!spectrumRef.value) return
  const instance = spectrumRef.value.getInstance()
  instance?.clearHighlightedSignals()
  highlightedSignals.value = []
  ElMessage.info('已清除所有高亮')
}

const togglePause = () => {
  if (!spectrumRef.value) return
  if (isPaused.value) {
    spectrumRef.value.play()
  } else {
    spectrumRef.value.pause()
  }
}

const resetZoom = () => {
  spectrumRef.value?.resetZoom()
  ElMessage.info('已重置缩放')
}

const addRainMarker = () => {
  if (!spectrumRef.value) return
  const instance = spectrumRef.value.getInstance()
  instance?.addRainMarker({
    id: Date.now(),
    startFreq: 940000000,
    endFreq: 960000000,
    followPlayLine: true,
    height: 50,
    color: '#ff9800',
    label: '测试语图标记'
  })
  ElMessage.success('已添加语图标记')
}

onMounted(() => {
  status.value = '等待组件加载...'
})

onBeforeUnmount(() => {
  stopDataStream()
})
</script>

<style scoped>
.test-page {
  padding: 20px;
  background: #000;
  color: #fff;
  min-height: 100vh;
}

.test-section {
  margin-bottom: 20px;
}

.spectrum-wrapper {
  width: 100%;
  height: 500px;
  background: #001122;
  border: 1px solid #1e4976;
  border-radius: 4px;
}

.test-controls {
  margin: 15px 0;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.test-info {
  margin-top: 15px;
  padding: 10px;
  background: rgba(30, 73, 118, 0.2);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}
</style>