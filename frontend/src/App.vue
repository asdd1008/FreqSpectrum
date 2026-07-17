<template>
  <div class="app-container">
    <el-tabs v-model="activeTab" class="main-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="实时频谱" name="realtime-spectrum">
        <SpectrumMonitor />
      </el-tab-pane>
      <el-tab-pane label="历史频谱" name="history-spectrum">
        <HistorySpectrum />
      </el-tab-pane>
      <el-tab-pane label="历史频谱(2)" name="history-spectrum-v2" :lazy="false">
        <HistorySpectrumV2 ref="historySpectrumV2Ref" />
      </el-tab-pane>
      <el-tab-pane label="电平监测" name="level">
        <LevelMonitor />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import SpectrumMonitor from './components/SpectrumMonitor.vue'
import HistorySpectrum from './components/HistorySpectrum.vue'
import HistorySpectrumV2 from './components/HistorySpectrumV2.vue'
import LevelMonitor from './components/LevelMonitor.vue'

const activeTab = ref('history-spectrum-v2')
const historySpectrumV2Ref = ref(null)

const handleTabChange = async (tabName) => {
  if (tabName === 'history-spectrum-v2') {
    await nextTick()
    setTimeout(() => {
      if (historySpectrumV2Ref.value) {
        historySpectrumV2Ref.value.resizeCanvas()
      }
    }, 100)
  }
}
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
}

.main-tabs {
  height: 100%;
}

.main-tabs :deep(.el-tabs__content) {
  height: calc(100% - 55px);
}

.main-tabs :deep(.el-tab-pane) {
  height: 100%;
}
</style>
