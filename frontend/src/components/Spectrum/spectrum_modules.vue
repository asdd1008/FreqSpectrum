<template>
  <div class="spectrum-modules-container">
    <BaseFreq
      ref="baseFreqRef"
      :height="height"
      :config="spectrumConfig"
      :hoverInfoFields="hoverInfoFields"
      :customMenuButtons="customMenuButtons"
      @ready="onSpectrumReady"
      @click="onSpectrumClick"
      @doubleClick="onSpectrumDoubleClick"
      @doubleClickMarker="onDoubleClickMarker"
      @hover="onSpectrumHover"
      @hoverEnd="onSpectrumHoverEnd"
      @zoom="onSpectrumZoom"
      @fallsSelectComplate="onFallsSelectComplate"
      @pause="onPause"
      @play="onPlay"
      @playbackStart="onPlaybackStart"
      @playbackStop="onPlaybackStop"
    />
    
    <div v-if="hoverInfo.visible" class="hover-popup"
      :style="{ left: hoverInfo.x + 'px', top: hoverInfo.y + 'px' }">
      <div class="hover-header">信号详情</div>
      <div class="hover-content">
        <div v-for="field in visibleHoverFields" :key="field.key">
          <span class="hover-label">{{ field.label }}:</span>
          <span class="hover-value">{{ field.value }}</span>
        </div>
      </div>
      <div v-if="customMenuButtons.length > 0" class="hover-actions">
        <el-button v-for="btn in customMenuButtons" :key="btn.action"
          size="small" @click="handleMenuAction(btn.action)">
          {{ btn.label }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, getCurrentInstance } from 'vue'
import { ElMessage } from 'element-plus'
import BaseFreq from './base_freq.vue'

const props = defineProps({
  height: {
    type: [String, Number],
    default: '100%'
  },
  defaultConfig: {
    type: Object,
    default: () => ({})
  },
  markers: {
    type: Array,
    default: () => []
  },
  rainMarkers: {
    type: Array,
    default: () => []
  },
  highlightedSignals: {
    type: Array,
    default: () => []
  },
  hoverInfoFields: {
    type: Array,
    default: () => [
      { key: 'skyFreq', label: '天空中心频率', visible: true },
      { key: 'accessFreq', label: '接入中心频率', visible: true },
      { key: 'bandwidth', label: '带宽', visible: true },
      { key: 'maxLevel', label: '最大电平值', visible: true }
    ]
  },
  customMenuButtons: {
    type: Array,
    default: () => [
      { label: '添加标记', action: 'addMarker' },
      { label: '高亮显示', action: 'highlight' },
      { label: '查看详情', action: 'details' }
    ]
  },
  pollingInterval: {
    type: Number,
    default: 1000
  }
})

const emit = defineEmits([
  'ready',
  'dataUpdate',
  'click',
  'doubleClick',
  'doubleClickMarker',
  'markerAdd',
  'markerRemove',
  'fallsSelectComplate',
  'signalHighlight',
  'pause',
  'play',
  'playbackStart',
  'playbackStop',
  'progressUpdate'
])

const { proxy } = getCurrentInstance()

const baseFreqRef = ref(null)
const spectrumConfig = ref({})
const isReady = ref(false)
const isPaused = ref(false)
const isPlayingBack = ref(false)

const playbackData = ref([])
const playbackIndex = ref(0)
let playbackTimer = null

const progressData = ref({ frame: 0, total: 0 })
let pollingTimer = null

const markersList = ref([])
const rainMarkersList = ref([])
const highlightedSignalsList = ref([])

const hoverInfo = reactive({
  visible: false,
  x: 0,
  y: 0,
  freq: 0,
  level: 0,
  maxLevel: 0,
  skyFreq: 0,
  accessFreq: 0,
  bandwidth: 0
})

const visibleHoverFields = computed(() => {
  return props.hoverInfoFields.filter(f => f.visible).map(field => ({
    ...field,
    value: getHoverFieldValue(field.key)
  }))
})

const getHoverFieldValue = (key) => {
  switch (key) {
    case 'skyFreq':
      return formatFreq(hoverInfo.skyFreq || 0)
    case 'accessFreq':
      return formatFreq(hoverInfo.accessFreq || 0)
    case 'bandwidth':
      return formatFreq(hoverInfo.bandwidth || 0)
    case 'maxLevel':
      return (hoverInfo.maxLevel || 0).toFixed(2) + ' dBm'
    case 'freq':
      return formatFreq(hoverInfo.freq || 0)
    case 'level':
      return (hoverInfo.level || 0).toFixed(2) + ' dBm'
    default:
      return hoverInfo[key] || ''
  }
}

const initSpectrumConfig = () => {
  const defaultConfig = {
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
    avgHold: false
  }
  
  spectrumConfig.value = mergeDeep(defaultConfig, props.defaultConfig)
}

const mergeDeep = (target, source) => {
  const result = { ...target }
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

const formatFreq = (freq) => {
  if (freq >= 1e9) return (freq / 1e9).toFixed(3) + ' GHz'
  if (freq >= 1e6) return (freq / 1e6).toFixed(3) + ' MHz'
  if (freq >= 1e3) return (freq / 1e3).toFixed(3) + ' kHz'
  return freq.toFixed(0) + ' Hz'
}

const onSpectrumReady = (instance) => {
  isReady.value = true
  
  if (props.markers.length > 0) {
    props.markers.forEach(m => instance.addMarker(m))
    markersList.value = [...props.markers]
  }
  
  if (props.highlightedSignals.length > 0) {
    props.highlightedSignals.forEach(s => instance.addHighlightedSignal?.(s))
    highlightedSignalsList.value = [...props.highlightedSignals]
  }
  
  startPolling()
  emit('ready', instance)
}

const onSpectrumClick = (data) => {
  emit('click', data)
}

const onSpectrumDoubleClick = (data) => {
  emit('doubleClick', data)
}

const onDoubleClickMarker = (data) => {
  emit('doubleClickMarker', data)
}

const onSpectrumHover = (data) => {
  if (data && data.freq !== undefined) {
    hoverInfo.visible = true
    hoverInfo.x = data.x + 15
    hoverInfo.y = data.y - 10
    hoverInfo.freq = data.freq
    hoverInfo.level = data.level || 0
    hoverInfo.skyFreq = data.skyFreq !== undefined ? data.skyFreq : data.freq
    hoverInfo.accessFreq = data.accessFreq !== undefined ? data.accessFreq : data.freq * 0.95
    hoverInfo.maxLevel = data.maxLevel !== undefined ? data.maxLevel : data.level || 0
    hoverInfo.bandwidth = data.bandwidth || spectrumConfig.value.span / 100
  }
  emit('hover', data)
}

const onSpectrumHoverEnd = () => {
  hoverInfo.visible = false
  emit('hoverEnd')
}

const onSpectrumZoom = (data) => {
  emit('zoom', data)
}

const onFallsSelectComplate = (result) => {
  emit('fallsSelectComplate', result)
  
  if (result && result.selectData && result.selectData.length > 0) {
    fallsSelectPlayBack(result)
  }
}

const fallsSelectPlayBack = (result) => {
  if (!baseFreqRef.value) return
  if (!result || !result.selectData || result.selectData.length === 0) return
  
  pause()
  playbackData.value = result.selectData || []
  playbackIndex.value = 0
  
  baseFreqRef.value.startPlayback(playbackData.value, (frameInfo) => {
    progressData.value = frameInfo
    emit('progressUpdate', frameInfo)
  })
  
  isPlayingBack.value = true
  isPaused.value = true
  
  ElMessage.success(`开始回放：${result.selectData.length}帧数据，频率范围 ${formatFreq(result.startFreq)} - ${formatFreq(result.endFreq)}`)
}

const onPause = () => {
  isPaused.value = true
  emit('pause')
}

const onPlay = () => {
  isPaused.value = false
  isPlayingBack.value = false
  playbackData.value = []
  emit('play')
}

const onPlaybackStart = () => {
  isPlayingBack.value = true
  emit('playbackStart')
}

const onPlaybackStop = () => {
  isPlayingBack.value = false
  emit('playbackStop')
}

const handleMenuAction = (action) => {
  switch (action) {
    case 'addMarker':
      addMarkerAtHover()
      break
    case 'highlight':
      highlightSignal()
      break
    case 'details':
      showSignalDetails()
      break
    default:
      emit('menuAction', { action, hoverInfo })
  }
}

const addMarkerAtHover = () => {
  if (!baseFreqRef.value || !hoverInfo.freq) return
  
  const newMarker = {
    id: Date.now(),
    freq: hoverInfo.freq,
    level: hoverInfo.level,
    note: ''
  }
  
  baseFreqRef.value.addMarker(newMarker)
  markersList.value.push(newMarker)
  emit('markerAdd', newMarker)
  ElMessage.success('已添加标记')
}

const highlightSignal = () => {
  if (!baseFreqRef.value || !hoverInfo.freq) return
  
  const newSignal = {
    id: Date.now(),
    freq: hoverInfo.freq,
    bandwidth: hoverInfo.bandwidth * 10,
    maxLevel: hoverInfo.maxLevel,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
  }
  
  baseFreqRef.value.getInstance()?.addHighlightedSignal?.(newSignal)
  highlightedSignalsList.value.push(newSignal)
  
  if (proxy?.$EventBus) {
    proxy.$EventBus.emit('screenSignal', { type: 'highlight', ...newSignal })
  }
  
  emit('signalHighlight', newSignal)
  ElMessage.success('已高亮信号')
}

const showSignalDetails = () => {
  ElMessage.info(`
    频率: ${formatFreq(hoverInfo.freq)}
    电平: ${(hoverInfo.level || 0).toFixed(2)} dBm
    最大电平: ${(hoverInfo.maxLevel || 0).toFixed(2)} dBm
  `)
}

const addData = (data) => {
  baseFreqRef.value?.addData(data)
  emit('dataUpdate', data)
}

const beginDraw = (frameData) => {
  baseFreqRef.value?.beginDraw(frameData)
}

const updateAxis = (config) => {
  spectrumConfig.value = mergeDeep(spectrumConfig.value, config)
  baseFreqRef.value?.updateAxis(config)
}

const addMarker = (marker) => {
  baseFreqRef.value?.addMarker(marker)
  markersList.value.push(marker)
  emit('markerAdd', marker)
}

const removeMarker = (id) => {
  baseFreqRef.value?.removeMarker(id)
  markersList.value = markersList.value.filter(m => m.id !== id)
  emit('markerRemove', id)
}

const clearMarkers = () => {
  baseFreqRef.value?.clearMarkers()
  markersList.value = []
}

const setZoom = (zoomX, zoomY) => {
  baseFreqRef.value?.setZoom(zoomX, zoomY)
}

const resetZoom = () => {
  baseFreqRef.value?.resetZoom()
}

const pause = () => {
  baseFreqRef.value?.pause()
}

const play = () => {
  baseFreqRef.value?.play()
}

const startPlayback = (data, onFrame) => {
  baseFreqRef.value?.startPlayback(data, onFrame)
}

const stopPlayback = () => {
  baseFreqRef.value?.stopPlayback()
}

const clearWaterfall = () => {
  baseFreqRef.value?.clearWaterfall()
}

const setConfig = (config) => {
  spectrumConfig.value = mergeDeep(spectrumConfig.value, config)
  baseFreqRef.value?.setConfig(config)
}

const getInstance = () => {
  return baseFreqRef.value?.getInstance()
}

const startPolling = () => {
  if (pollingTimer) clearInterval(pollingTimer)
  
  pollingTimer = setInterval(() => {
    emit('polling', progressData.value)
  }, props.pollingInterval)
}

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

watch(() => props.markers, (newMarkers) => {
  if (baseFreqRef.value) {
    baseFreqRef.value.clearMarkers()
    newMarkers.forEach(m => baseFreqRef.value.addMarker(m))
    markersList.value = [...newMarkers]
  }
}, { deep: true })

watch(() => props.highlightedSignals, (newSignals) => {
  if (baseFreqRef.value) {
    const instance = baseFreqRef.value.getInstance()
    instance?.clearHighlightedSignals?.()
    newSignals.forEach(s => instance?.addHighlightedSignal?.(s))
    highlightedSignalsList.value = [...newSignals]
  }
}, { deep: true })

onMounted(() => {
  initSpectrumConfig()
})

onBeforeUnmount(() => {
  stopPolling()
  stopPlayback()
})

defineExpose({
  addData,
  beginDraw,
  updateAxis,
  addMarker,
  removeMarker,
  clearMarkers,
  setZoom,
  resetZoom,
  pause,
  play,
  startPlayback,
  stopPlayback,
  clearWaterfall,
  setConfig,
  getInstance,
  isReady,
  isPaused,
  isPlayingBack,
  markers: markersList,
  highlightedSignals: highlightedSignalsList,
  progressData
})
</script>

<style scoped>
.spectrum-modules-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.hover-popup {
  position: fixed;
  background: rgba(0, 20, 40, 0.95);
  border: 1px solid #1e4976;
  border-radius: 6px;
  padding: 10px;
  min-width: 200px;
  z-index: 9999;
  transform: translate(0, -100%);
  pointer-events: auto;
}

.hover-header {
  font-size: 12px;
  font-weight: bold;
  color: #66b2ff;
  margin-bottom: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid #1e4976;
}

.hover-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.hover-label {
  font-size: 11px;
  color: #8892a6;
  margin-right: 8px;
}

.hover-value {
  font-size: 11px;
  color: #fff;
  font-family: monospace;
}

.hover-actions {
  display: flex;
  gap: 5px;
  justify-content: flex-end;
}
</style>