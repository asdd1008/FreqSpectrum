<template>
  <div ref="spectrumContainer" class="base-freq-container" :style="{ height: wrapFreqHeight }">
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, getCurrentInstance, nextTick } from 'vue'
import { Spectrum } from './Spectrum.js'
import mitt from 'mitt'

const props = defineProps({
  height: {
    type: [String, Number],
    default: '100%'
  },
  config: {
    type: Object,
    default: () => ({})
  },
  hoverInfoFields: {
    type: Array,
    default: () => ['centerFreq', 'bandwidth', 'maxLevel']
  },
  customMenuButtons: {
    type: Array,
    default: () => []
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
  'markerAdd',
  'markerRemove'
])

const { proxy } = getCurrentInstance()

const spectrumContainer = ref(null)
const spectrumInstance = ref(null)
const isReady = ref(false)

const wrapFreqHeight = computed(() => {
  if (typeof props.height === 'number') {
    return props.height + 'px'
  }
  return props.height
})

const initSpectrum = () => {
  if (!spectrumContainer.value) return
  
  const mergedConfig = {
    ...props.config
  }
  
  spectrumInstance.value = new Spectrum(spectrumContainer.value, mergedConfig)
  
  spectrumInstance.value.on('click', (data) => {
    emit('click', data)
  })
  
  spectrumInstance.value.on('doubleClick', (data) => {
    emit('doubleClick', data)
  })
  
  spectrumInstance.value.on('doubleClickMarker', (data) => {
    emit('doubleClickMarker', data)
  })
  
  spectrumInstance.value.on('hover', (data) => {
    emit('hover', data)
  })
  
  spectrumInstance.value.on('hoverEnd', () => {
    emit('hoverEnd')
  })
  
  spectrumInstance.value.on('zoom', (data) => {
    emit('zoom', data)
  })
  
  spectrumInstance.value.on('resize', (data) => {
    emit('resize', data)
  })
  
  spectrumInstance.value.on('fallsSelectComplate', (data) => {
    emit('fallsSelectComplate', data)
  })
  
  spectrumInstance.value.on('pause', () => {
    emit('pause')
  })
  
  spectrumInstance.value.on('play', () => {
    emit('play')
  })
  
  spectrumInstance.value.on('playbackStart', () => {
    emit('playbackStart')
  })
  
  spectrumInstance.value.on('playbackStop', () => {
    emit('playbackStop')
  })
  
  if (proxy?.$EventBus) {
    proxy.$EventBus.on('screenSignal', handleScreenSignal)
  }
  
  isReady.value = true
  emit('ready', spectrumInstance.value)
}

const handleScreenSignal = (signal) => {
  if (!spectrumInstance.value) return
  
  if (signal.type === 'highlight') {
    spectrumInstance.value.addHighlightedSignal?.(signal)
  } else if (signal.type === 'clearHighlight') {
    spectrumInstance.value.clearHighlightedSignals?.()
  }
}

const beginDraw = (frameData) => {
  spectrumInstance.value?.beginDraw(frameData)
}

const addData = (data) => {
  spectrumInstance.value?.addData(data)
}

const updateAxis = (config) => {
  spectrumInstance.value?.updateAxis(config)
}

const addMarker = (marker) => {
  spectrumInstance.value?.addMarker(marker)
}

const removeMarker = (id) => {
  spectrumInstance.value?.removeMarker(id)
}

const clearMarkers = () => {
  spectrumInstance.value?.clearMarkers()
}

const setZoom = (zoomX, zoomY) => {
  spectrumInstance.value?.setZoom(zoomX, zoomY)
}

const resetZoom = () => {
  spectrumInstance.value?.resetZoom()
}

const pause = () => {
  spectrumInstance.value?.pause()
}

const play = () => {
  spectrumInstance.value?.play()
}

const startPlayback = (data, onFrame) => {
  spectrumInstance.value?.startPlayback(data, onFrame)
}

const stopPlayback = () => {
  spectrumInstance.value?.stopPlayback()
}

const clearWaterfall = () => {
  spectrumInstance.value?.clearWaterfall()
}

const setConfig = (config) => {
  spectrumInstance.value?.setConfig(config)
}

const getInstance = () => {
  return spectrumInstance.value
}

defineExpose({
  beginDraw,
  addData,
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

watch(() => props.config, (newConfig) => {
  if (spectrumInstance.value && newConfig) {
    spectrumInstance.value.setConfig(newConfig)
  }
}, { deep: true })

onMounted(() => {
  nextTick(() => {
    initSpectrum()
  })
})

onBeforeUnmount(() => {
  if (proxy?.$EventBus) {
    proxy.$EventBus.off('screenSignal', handleScreenSignal)
  }
  
  if (spectrumInstance.value) {
    spectrumInstance.value.destroy()
    spectrumInstance.value = null
  }
})
</script>

<style scoped>
.base-freq-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
  position: relative;
  overflow: hidden;
}
</style>