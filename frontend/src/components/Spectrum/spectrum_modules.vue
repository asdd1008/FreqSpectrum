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
      @playbackPause="handlePlaybackPause"
      @playbackResume="handlePlaybackResume"
    />
    
    <div v-if="state.isPlayback" class="playback-controls">
      <button @click="togglePlaybackPause">
        {{ state.isPlaybackPaused ? '播放' : '暂停' }}
      </button>
      <button @click="stopPlayback">停止</button>
      <div class="playback-progress">
        <input 
          type="range" 
          :min="0" 
          :max="Math.max(0, state.playbackTotal - 1)" 
          :value="state.playbackFrame"
          @input="handleProgressInput"
          class="progress-slider"
        />
        <span class="progress-text">{{ state.playbackFrame + 1 }} / {{ state.playbackTotal }}</span>
      </div>
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
  },
  hoverInfo: {
    type: Object,
    default: () => ({})
  },
  playbackSpeed: {
    type: Number,
    default: 1000
  }
})

const emit = defineEmits([
  'ready',
  'click',
  'doubleClick',
  'markerClick',
  'hover',
  'hoverEnd',
  'zoomChange',
  'fallsSelect',
  'playbackFrame',
  'playbackStart',
  'playbackStop',
  'playbackPause',
  'playbackResume',
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
  avgHold: false,
  playbackSpeed: 1000,
  hoverInfo: {
    visible: true,
    fields: ['centerFreq', 'bandwidth', 'maxLevel'],
    customFields: [],
    menuButtons: []
  }
}

const mergedConfig = computed(() => {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...props.config,
    padding: { ...DEFAULT_CONFIG.padding, ...props.config.padding },
    hoverInfo: { ...DEFAULT_CONFIG.hoverInfo, ...props.hoverInfo, ...props.config.hoverInfo },
    playbackSpeed: props.playbackSpeed || props.config.playbackSpeed || DEFAULT_CONFIG.playbackSpeed
  }
  return cfg
})

const state = reactive({
  isReady: false,
  isPaused: false,
  isPlayback: false,
  isPlaybackPaused: false,
  playbackFrame: 0,
  playbackTotal: 0,
  playbackData: null,
  currentData: null,
  rainMarkers: [],
  signalBoxes: [],
  selectResult: null
})

const isPlaying = computed(() => !state.isPaused && !state.isPlayback)

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
      addRainMarker,
      removeRainMarker,
      clearRainMarkers,
      setZoom,
      resetZoom,
      pause,
      play,
      startPlayback,
      pausePlayback,
      resumePlayback,
      seekPlayback,
      stopPlayback,
      clearWaterfall,
      setConfig,
      setHoverInfoConfig,
      getInstance,
      getFreqForX,
      getXForFreq,
      getLevelForY,
      getYForLevel,
      fallsSelectPlayBack,
      eventBus
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
  emit('hoverEnd')
}

function handleZoom(data) {
  emit('zoomChange', data)
}

function handleResize(data) {
}

function handleFallsSelectComplate(result) {
  state.selectResult = result
  emit('fallsSelect', result)
}

function handlePause() {
  state.isPaused = true
  emit('pause')
}

function handlePlay() {
  state.isPaused = false
  state.isPlayback = false
  state.isPlaybackPaused = false
  state.playbackData = null
  state.playbackFrame = 0
  state.playbackTotal = 0
  emit('play')
}

function handlePlaybackStart(data) {
  state.isPlayback = true
  state.isPlaybackPaused = false
  state.playbackTotal = data.total || 0
  emit('playbackStart', data)
}

function handlePlaybackStop() {
  state.isPlayback = false
  state.isPlaybackPaused = false
  state.playbackFrame = 0
  state.playbackTotal = 0
  state.playbackData = null
  emit('playbackStop')
}

function handlePlaybackPause() {
  state.isPlaybackPaused = true
  emit('playbackPause')
}

function handlePlaybackResume() {
  state.isPlaybackPaused = false
  emit('playbackResume')
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

function togglePlaybackPause() {
  if (!state.isPlayback) return
  
  if (state.isPlaybackPaused) {
    resumePlayback()
  } else {
    pausePlayback()
  }
}

function handleProgressInput(e) {
  const frameIndex = parseInt(e.target.value)
  seekPlayback(frameIndex)
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

function addRainMarker(marker) {
  state.rainMarkers.push(marker)
  baseFreqRef.value?.addRainMarker(marker)
}

function updateRainMarker(id, updates) {
  const marker = state.rainMarkers.find(m => m.id === id)
  if (marker) {
    Object.assign(marker, updates)
  }
}

function removeRainMarker(id) {
  state.rainMarkers = state.rainMarkers.filter(m => m.id !== id)
  baseFreqRef.value?.removeRainMarker(id)
}

function clearRainMarkers() {
  state.rainMarkers = []
  baseFreqRef.value?.clearRainMarkers()
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

function pausePlayback() {
  baseFreqRef.value?.pausePlayback()
}

function resumePlayback() {
  baseFreqRef.value?.resumePlayback()
}

function seekPlayback(frameIndex) {
  baseFreqRef.value?.seekPlayback(frameIndex)
  state.playbackFrame = frameIndex
}

function stopPlayback() {
  baseFreqRef.value?.stopPlayback()
  state.isPlayback = false
  state.isPlaybackPaused = false
  state.playbackData = null
  state.playbackFrame = 0
  state.playbackTotal = 0
  play()
}

function clearWaterfall() {
  baseFreqRef.value?.clearWaterfall()
}

function setConfig(config) {
  baseFreqRef.value?.setConfig(config)
}

function setHoverInfoConfig(config) {
  baseFreqRef.value?.setHoverInfoConfig(config)
}

function getInstance() {
  return baseFreqRef.value?.getInstance()
}

function getFreqForX(x) {
  return baseFreqRef.value?.getFreqForX(x)
}

function getXForFreq(freq) {
  return baseFreqRef.value?.getXForFreq(freq)
}

function getLevelForY(y) {
  return baseFreqRef.value?.getLevelForY(y)
}

function getYForLevel(level) {
  return baseFreqRef.value?.getYForLevel(level)
}

function addSignalBox(box) {
  state.signalBoxes.push(box)
  eventBus.emit('screenSignal', { type: 'boxSelect', data: box })
}

function clearSignalBoxes() {
  state.signalBoxes = []
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
  eventBus.all.clear()
})

defineExpose({
  addData,
  beginDraw,
  updateAxis,
  addMarker,
  removeMarker,
  clearMarkers,
  addRainMarker,
  updateRainMarker,
  removeRainMarker,
  clearRainMarkers,
  setZoom,
  resetZoom,
  pause,
  play,
  startPlayback,
  pausePlayback,
  resumePlayback,
  seekPlayback,
  stopPlayback,
  clearWaterfall,
  setConfig,
  setHoverInfoConfig,
  getInstance,
  getFreqForX,
  getXForFreq,
  getLevelForY,
  getYForLevel,
  fallsSelectPlayBack,
  addSignalBox,
  clearSignalBoxes,
  eventBus,
  isPlaying
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
  gap: 12px;
  padding: 8px 16px;
  background: rgba(0, 20, 40, 0.95);
  border: 1px solid rgba(100, 150, 200, 0.5);
  border-radius: 6px;
  color: #cce0ff;
  font-size: 12px;
  z-index: 100;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.playback-controls button {
  padding: 5px 14px;
  background: rgba(0, 100, 200, 0.5);
  border: 1px solid rgba(100, 150, 200, 0.5);
  border-radius: 4px;
  color: #cce0ff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.playback-controls button:hover {
  background: rgba(0, 150, 255, 0.6);
  border-color: rgba(100, 180, 255, 0.7);
}

.playback-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-slider {
  width: 200px;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(0, 50, 100, 0.5);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #66b3ff;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.progress-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #66b3ff;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.progress-text {
  font-family: monospace;
  color: #99c2ff;
  min-width: 70px;
  text-align: center;
}
</style>
