<template>
  <div class="spectrum-modules">
    <base-freq
      ref="baseFreqRef"
      :config="mergedConfig"
      :eventBus="eventBus"
      @ready="handleSpectrumReady"
      @click="handleClick"
      @doubleClick="handleDoubleClick"
      @doubleClickMarker="handleDoubleClickMarker"
      @hover="handleHover"
      @hoverEnd="handleHoverEnd"
      @zoom="handleZoom"
      @resize="handleResize"
      @fallsSelectComplate="handleFallsSelectComplate"
      @pause="handlePause"
      @play="handlePlay"
      @playbackStart="handlePlaybackStart"
      @playbackStop="handlePlaybackStop"
    />
    
    <div v-if="showPlaybackControls" class="playback-controls">
      <button @click="togglePlayback">{{ isPlaying ? '暂停' : '播放' }}</button>
      <button @click="stopPlayback">停止</button>
      <span>进度: {{ playbackFrame }} / {{ playbackTotal }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import mitt from 'mitt'
import BaseFreq from './base_freq.vue'

const props = defineProps({
  config: {
    type: Object,
    default: () => ({})
  },
  markers: {
    type: Array,
    default: () => []
  },
  signalSelections: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits([
  'ready',
  'click',
  'doubleClick',
  'markerClick',
  'hover',
  'zoomChange',
  'fallsSelect',
  'playbackFrame',
  'pause',
  'play'
])

const baseFreqRef = ref(null)
const eventBus = mitt()

const DEFAULT_CONFIG = {
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

const mergedConfig = computed(() => {
  return {
    ...DEFAULT_CONFIG,
    ...props.config,
    padding: { ...DEFAULT_CONFIG.padding, ...props.config.padding }
  }
})

const state = reactive({
  isReady: false,
  isPaused: false,
  isPlaying: false,
  isPlayback: false,
  playbackFrame: 0,
  playbackTotal: 0,
  playbackData: null,
  currentData: null,
  rainMarkers: [],
  signalBoxes: []
})

const showPlaybackControls = computed(() => state.isPlayback)
const isPlaying = computed(() => state.isPlaying)
const playbackFrame = computed(() => state.playbackFrame)
const playbackTotal = computed(() => state.playbackTotal)

let pollingTimer = null

function initSpectrumConfig() {
  return { ...DEFAULT_CONFIG, ...props.config }
}

function handleSpectrumReady(instance) {
  state.isReady = true
  
  props.markers.forEach(m => {
    baseFreqRef.value?.addMarker(m)
  })
  
  emit('ready', {
    instance,
    api: {
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
      fallsSelectPlayBack
    }
  })
}

function addData(data) {
  if (!state.isPaused && !state.isPlayback) {
    baseFreqRef.value?.addData(data)
    state.currentData = data
  }
}

function beginDraw(frameData) {
  baseFreqRef.value?.beginDraw(frameData)
}

function updateAxis(config) {
  baseFreqRef.value?.updateAxis(config)
}

function handleClick(data) {
  emit('click', data)
}

function handleDoubleClick(data) {
  emit('doubleClick', data)
}

function handleDoubleClickMarker(data) {
  emit('markerClick', data)
}

function handleHover(data) {
  emit('hover', data)
}

function handleHoverEnd() {
}

function handleZoom(data) {
  emit('zoomChange', data)
}

function handleResize(data) {
}

function handleFallsSelectComplate(result) {
  emit('fallsSelect', result)
}

function handlePause() {
  state.isPaused = true
  stopPolling()
  emit('pause')
}

function handlePlay() {
  state.isPaused = false
  state.isPlayback = false
  state.playbackData = null
  emit('play')
}

function handlePlaybackStart() {
  state.isPlayback = true
  state.isPlaying = true
}

function handlePlaybackStop() {
  state.isPlayback = false
  state.isPlaying = false
}

function fallsSelectPlayBack(data, item) {
  if (!data || !data.selectData || data.selectData.length === 0) return
  
  pause()
  
  state.playbackData = data.selectData
  state.playbackTotal = data.selectData.length
  state.playbackFrame = 0
  
  baseFreqRef.value?.startPlayback(data.selectData, (frameInfo) => {
    state.playbackFrame = frameInfo.frame
    state.playbackTotal = frameInfo.total
    emit('playbackFrame', frameInfo)
  })
}

function togglePlayback() {
  if (!state.isPlayback) return
  
  if (state.isPlaying) {
    state.isPlaying = false
  } else {
    state.isPlaying = true
  }
}

function stopPlayback() {
  baseFreqRef.value?.stopPlayback()
  state.isPlayback = false
  state.isPlaying = false
  state.playbackData = null
  state.playbackFrame = 0
  state.playbackTotal = 0
  play()
}

function addMarker(marker) {
  baseFreqRef.value?.addMarker(marker)
}

function removeMarker(id) {
  baseFreqRef.value?.removeMarker(id)
}

function clearMarkers() {
  baseFreqRef.value?.clearMarkers()
}

function setZoom(zoomX, zoomY) {
  baseFreqRef.value?.setZoom(zoomX, zoomY)
}

function resetZoom() {
  baseFreqRef.value?.resetZoom()
}

function pause() {
  baseFreqRef.value?.pause()
}

function play() {
  baseFreqRef.value?.play()
}

function startPlayback(data, onFrame) {
  baseFreqRef.value?.startPlayback(data, onFrame)
}

function clearWaterfall() {
  baseFreqRef.value?.clearWaterfall()
}

function setConfig(config) {
  baseFreqRef.value?.setConfig(config)
}

function getInstance() {
  return baseFreqRef.value?.getInstance()
}

function addRainMarker(marker) {
  state.rainMarkers.push(marker)
}

function updateRainMarker(id, updates) {
  const marker = state.rainMarkers.find(m => m.id === id)
  if (marker) {
    Object.assign(marker, updates)
  }
}

function removeRainMarker(id) {
  state.rainMarkers = state.rainMarkers.filter(m => m.id !== id)
}

function clearRainMarkers() {
  state.rainMarkers = []
}

function addSignalBox(box) {
  state.signalBoxes.push(box)
  eventBus.emit('screenSignal', { type: 'boxSelect', data: box })
}

function clearSignalBoxes() {
  state.signalBoxes = []
}

function startPolling(interval = 100) {
  stopPolling()
  pollingTimer = setInterval(() => {
    if (state.isPlayback && state.isPlaying) {
    }
  }, interval)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

watch(() => props.markers, (newMarkers) => {
  if (state.isReady) {
    baseFreqRef.value?.clearMarkers()
    newMarkers.forEach(m => baseFreqRef.value?.addMarker(m))
  }
}, { deep: true })

onMounted(() => {
})

onBeforeUnmount(() => {
  stopPolling()
  eventBus.all.clear()
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
  fallsSelectPlayBack,
  addRainMarker,
  updateRainMarker,
  removeRainMarker,
  clearRainMarkers,
  addSignalBox,
  clearSignalBoxes,
  eventBus
})
</script>

<style scoped>
.spectrum-modules {
  width: 100%;
  height: 100%;
  position: relative;
}

.playback-controls {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(0, 20, 40, 0.9);
  border: 1px solid rgba(100, 150, 200, 0.5);
  border-radius: 4px;
  color: #cce0ff;
  font-size: 12px;
  z-index: 100;
}

.playback-controls button {
  padding: 4px 12px;
  background: rgba(0, 100, 200, 0.5);
  border: 1px solid rgba(100, 150, 200, 0.5);
  border-radius: 3px;
  color: #cce0ff;
  cursor: pointer;
  font-size: 12px;
}

.playback-controls button:hover {
  background: rgba(0, 150, 255, 0.6);
}
</style>
