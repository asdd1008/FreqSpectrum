<template>
  <div ref="spectrumContainer" class="base-freq-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { Spectrum } from './Spectrum.js'

const props = defineProps({
  config: {
    type: Object,
    default: () => ({})
  },
  eventBus: {
    type: Object,
    default: null
  }
})

const emit = defineEmits([
  'ready',
  'click',
  'doubleClick',
  'doubleClickMarker',
  'hover',
  'hoverEnd',
  'zoom',
  'resize',
  'fallsSelectComplate',
  'pause',
  'play',
  'playbackStart',
  'playbackStop',
  'playbackPause',
  'playbackResume',
  'playbackFrame'
])

const spectrumContainer = ref(null)
let spectrumInstance = null

const wrapFreqHeight = computed(() => {
  return spectrumInstance ? spectrumInstance.height : 0
})

function initSpectrum() {
  if (!spectrumContainer.value) return
  
  spectrumInstance = new Spectrum(spectrumContainer.value, props.config)
  
  spectrumInstance.on('click', (data) => emit('click', data))
  spectrumInstance.on('doubleClick', (data) => emit('doubleClick', data))
  spectrumInstance.on('doubleClickMarker', (data) => emit('doubleClickMarker', data))
  spectrumInstance.on('hover', (data) => emit('hover', data))
  spectrumInstance.on('hoverEnd', () => emit('hoverEnd'))
  spectrumInstance.on('zoom', (data) => emit('zoom', data))
  spectrumInstance.on('resize', (data) => emit('resize', data))
  spectrumInstance.on('fallsSelectComplate', (data) => emit('fallsSelectComplate', data))
  spectrumInstance.on('pause', () => emit('pause'))
  spectrumInstance.on('play', () => emit('play'))
  spectrumInstance.on('playbackStart', (data) => emit('playbackStart', data))
  spectrumInstance.on('playbackStop', () => emit('playbackStop'))
  spectrumInstance.on('playbackPause', () => emit('playbackPause'))
  spectrumInstance.on('playbackResume', () => emit('playbackResume'))
  
  if (props.eventBus) {
    props.eventBus.on('screenSignal', handleScreenSignal)
    props.eventBus.on('addMarker', handleAddMarker)
    props.eventBus.on('clearMarkers', handleClearMarkers)
    props.eventBus.on('setZoom', handleSetZoom)
    props.eventBus.on('resetZoom', handleResetZoom)
  }
  
  emit('ready', spectrumInstance)
}

function handleScreenSignal(signal) {
  if (!spectrumInstance) return
  
  if (signal.type === 'boxSelect') {
    spectrumInstance.boxSelection = signal.data
    spectrumInstance._drawActiveLayer()
  }
}

function handleAddMarker(marker) {
  spectrumInstance?.addMarker(marker)
}

function handleClearMarkers() {
  spectrumInstance?.clearMarkers()
}

function handleSetZoom(data) {
  spectrumInstance?.setZoom(data.zoomX, data.zoomY)
}

function handleResetZoom() {
  spectrumInstance?.resetZoom()
}

function addData(data) {
  spectrumInstance?.addData(data)
}

function beginDraw(frameData) {
  spectrumInstance?.beginDraw(frameData)
}

function updateAxis(config) {
  spectrumInstance?.updateAxis(config)
}

function addMarker(marker) {
  spectrumInstance?.addMarker(marker)
}

function removeMarker(id) {
  spectrumInstance?.removeMarker(id)
}

function clearMarkers() {
  spectrumInstance?.clearMarkers()
}

function addRainMarker(marker) {
  spectrumInstance?.addRainMarker(marker)
}

function removeRainMarker(id) {
  spectrumInstance?.removeRainMarker(id)
}

function clearRainMarkers() {
  spectrumInstance?.clearRainMarkers()
}

function setZoom(zoomX, zoomY) {
  spectrumInstance?.setZoom(zoomX, zoomY)
}

function resetZoom() {
  spectrumInstance?.resetZoom()
}

function pause() {
  spectrumInstance?.pause()
}

function play() {
  spectrumInstance?.play()
}

function startPlayback(data, onFrame) {
  spectrumInstance?.startPlayback(data, onFrame)
}

function pausePlayback() {
  spectrumInstance?.pausePlayback()
}

function resumePlayback() {
  spectrumInstance?.resumePlayback()
}

function seekPlayback(frameIndex) {
  spectrumInstance?.seekPlayback(frameIndex)
}

function stopPlayback() {
  spectrumInstance?.stopPlayback()
}

function clearWaterfall() {
  spectrumInstance?.clearWaterfall()
}

function setConfig(config) {
  spectrumInstance?.setConfig(config)
}

function setHoverInfoConfig(config) {
  spectrumInstance?.setHoverInfoConfig(config)
}

function getInstance() {
  return spectrumInstance
}

function getFreqForX(x) {
  return spectrumInstance?.getFreqForX(x)
}

function getXForFreq(freq) {
  return spectrumInstance?.getXForFreq(freq)
}

function getLevelForY(y) {
  return spectrumInstance?.getLevelForY(y)
}

function getYForLevel(level) {
  return spectrumInstance?.getYForLevel(level)
}

function render() {
  spectrumInstance?.render()
}

watch(() => props.config, (newConfig) => {
  if (spectrumInstance) {
    spectrumInstance.setConfig(newConfig)
  }
}, { deep: true })

onMounted(() => {
  initSpectrum()
})

onBeforeUnmount(() => {
  if (props.eventBus) {
    props.eventBus.off('screenSignal', handleScreenSignal)
    props.eventBus.off('addMarker', handleAddMarker)
    props.eventBus.off('clearMarkers', handleClearMarkers)
    props.eventBus.off('setZoom', handleSetZoom)
    props.eventBus.off('resetZoom', handleResetZoom)
  }
  spectrumInstance?.destroy()
  spectrumInstance = null
})

defineExpose({
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
  render,
  wrapFreqHeight
})
</script>

<style scoped>
.base-freq-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000a14;
}
</style>
