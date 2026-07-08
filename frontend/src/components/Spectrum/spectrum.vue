<template>
  <div class="spectrum-wrapper">
    <spectrum-modules
      ref="spectrumModulesRef"
      :config="finalConfig"
      :markers="markers"
      :signalSelections="signalSelections"
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
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import SpectrumModules from './spectrum_modules.vue'

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

const spectrumModulesRef = ref(null)

const finalConfig = computed(() => props.config)

function handleReady(data) {
  emit('ready', data)
}

function handleClick(data) {
  emit('click', data)
}

function handleDoubleClick(data) {
  emit('doubleClick', data)
}

function handleMarkerClick(data) {
  emit('markerClick', data)
}

function handleHover(data) {
  emit('hover', data)
}

function handleZoomChange(data) {
  emit('zoomChange', data)
}

function handleFallsSelect(data) {
  emit('fallsSelect', data)
}

function handlePlaybackFrame(data) {
  emit('playbackFrame', data)
}

function handlePause() {
  emit('pause')
}

function handlePlay() {
  emit('play')
}

defineExpose({
  addData: (data) => spectrumModulesRef.value?.addData(data),
  beginDraw: (frameData) => spectrumModulesRef.value?.beginDraw(frameData),
  updateAxis: (config) => spectrumModulesRef.value?.updateAxis(config),
  addMarker: (marker) => spectrumModulesRef.value?.addMarker(marker),
  removeMarker: (id) => spectrumModulesRef.value?.removeMarker(id),
  clearMarkers: () => spectrumModulesRef.value?.clearMarkers(),
  setZoom: (zoomX, zoomY) => spectrumModulesRef.value?.setZoom(zoomX, zoomY),
  resetZoom: () => spectrumModulesRef.value?.resetZoom(),
  pause: () => spectrumModulesRef.value?.pause(),
  play: () => spectrumModulesRef.value?.play(),
  startPlayback: (data, onFrame) => spectrumModulesRef.value?.startPlayback(data, onFrame),
  stopPlayback: () => spectrumModulesRef.value?.stopPlayback(),
  clearWaterfall: () => spectrumModulesRef.value?.clearWaterfall(),
  setConfig: (config) => spectrumModulesRef.value?.setConfig(config),
  getInstance: () => spectrumModulesRef.value?.getInstance(),
  fallsSelectPlayBack: (data, item) => spectrumModulesRef.value?.fallsSelectPlayBack(data, item),
  addRainMarker: (marker) => spectrumModulesRef.value?.addRainMarker(marker),
  updateRainMarker: (id, updates) => spectrumModulesRef.value?.updateRainMarker(id, updates),
  removeRainMarker: (id) => spectrumModulesRef.value?.removeRainMarker(id),
  clearRainMarkers: () => spectrumModulesRef.value?.clearRainMarkers(),
  addSignalBox: (box) => spectrumModulesRef.value?.addSignalBox(box),
  clearSignalBoxes: () => spectrumModulesRef.value?.clearSignalBoxes(),
  eventBus: () => spectrumModulesRef.value?.eventBus
})

onMounted(() => {
})

onBeforeUnmount(() => {
})
</script>

<style scoped>
.spectrum-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000a14;
}
</style>
