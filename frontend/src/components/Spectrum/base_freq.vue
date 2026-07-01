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
  'playbackStop'
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
  spectrumInstance.on('playbackStart', () => emit('playbackStart'))
  spectrumInstance.on('playbackStop', () => emit('playbackStop'))
  
  if (props.eventBus) {
    props.eventBus.on('screenSignal', handleScreenSignal)
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

function stopPlayback() {
  spectrumInstance?.stopPlayback()
}

function clearWaterfall() {
  spectrumInstance?.clearWaterfall()
}

function setConfig(config) {
  spectrumInstance?.setConfig(config)
}

function getInstance() {
  return spectrumInstance
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
  setZoom,
  resetZoom,
  pause,
  play,
  startPlayback,
  stopPlayback,
  clearWaterfall,
  setConfig,
  getInstance,
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
