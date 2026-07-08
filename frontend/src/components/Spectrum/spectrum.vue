<template>
  <div class="spectrum-container">
    <SpectrumModules
      ref="spectrumModulesRef"
      :height="height"
      :default-config="config"
      :markers="markers"
      :highlighted-signals="highlightedSignals"
      :hover-info-fields="hoverInfoFields"
      :custom-menu-buttons="customMenuButtons"
      @ready="onReady"
      @click="onClick"
      @double-click="onDoubleClick"
      @double-click-marker="onDoubleClickMarker"
      @marker-add="onMarkerAdd"
      @marker-remove="onMarkerRemove"
      @falls-select-complate="onFallsSelectComplate"
      @signal-highlight="onSignalHighlight"
      @pause="onPause"
      @play="onPlay"
      @playback-start="onPlaybackStart"
      @playback-stop="onPlaybackStop"
      @progress-update="onProgressUpdate"
      @zoom="onZoom"
      @hover="onHover"
      @hover-end="onHoverEnd"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import SpectrumModules from './spectrum_modules.vue'

const props = defineProps({
  height: {
    type: [String, Number],
    default: '100%'
  },
  config: {
    type: Object,
    default: () => ({})
  },
  markers: {
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
  }
})

const emit = defineEmits([
  'ready',
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
  'progressUpdate',
  'zoom',
  'hover',
  'hoverEnd',
  'dataUpdate'
])

const { proxy } = getCurrentInstance()

const spectrumModulesRef = ref(null)
const isReady = ref(false)

const onReady = (instance) => {
  isReady.value = true
  emit('ready', instance)
}

const onClick = (data) => {
  emit('click', data)
}

const onDoubleClick = (data) => {
  emit('doubleClick', data)
}

const onDoubleClickMarker = (data) => {
  emit('doubleClickMarker', data)
}

const onMarkerAdd = (marker) => {
  emit('markerAdd', marker)
}

const onMarkerRemove = (id) => {
  emit('markerRemove', id)
}

const onFallsSelectComplate = (result) => {
  emit('fallsSelectComplate', result)
}

const onSignalHighlight = (signal) => {
  emit('signalHighlight', signal)
}

const onPause = () => {
  emit('pause')
}

const onPlay = () => {
  emit('play')
}

const onPlaybackStart = () => {
  emit('playbackStart')
}

const onPlaybackStop = () => {
  emit('playbackStop')
}

const onProgressUpdate = (progress) => {
  emit('progressUpdate', progress)
}

const onZoom = (data) => {
  emit('zoom', data)
}

const onHover = (data) => {
  emit('hover', data)
}

const onHoverEnd = () => {
  emit('hoverEnd')
}

const addData = (data) => {
  spectrumModulesRef.value?.addData(data)
  emit('dataUpdate', data)
}

const beginDraw = (frameData) => {
  spectrumModulesRef.value?.beginDraw(frameData)
}

const updateAxis = (config) => {
  spectrumModulesRef.value?.updateAxis(config)
}

const addMarker = (marker) => {
  spectrumModulesRef.value?.addMarker(marker)
}

const removeMarker = (id) => {
  spectrumModulesRef.value?.removeMarker(id)
}

const clearMarkers = () => {
  spectrumModulesRef.value?.clearMarkers()
}

const setZoom = (zoomX, zoomY) => {
  spectrumModulesRef.value?.setZoom(zoomX, zoomY)
}

const resetZoom = () => {
  spectrumModulesRef.value?.resetZoom()
}

const pause = () => {
  spectrumModulesRef.value?.pause()
}

const play = () => {
  spectrumModulesRef.value?.play()
}

const startPlayback = (data, onFrame) => {
  spectrumModulesRef.value?.startPlayback(data, onFrame)
}

const stopPlayback = () => {
  spectrumModulesRef.value?.stopPlayback()
}

const clearWaterfall = () => {
  spectrumModulesRef.value?.clearWaterfall()
}

const setConfig = (config) => {
  spectrumModulesRef.value?.setConfig(config)
}

const getInstance = () => {
  return spectrumModulesRef.value?.getInstance()
}

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
  isReady
})
</script>

<style scoped>
.spectrum-container {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>