<template>
  <div class="app-container">
    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane label="频谱监测" name="spectrum">
        <SpectrumMonitor />
      </el-tab-pane>
      <el-tab-pane label="电平监测" name="level">
        <LevelMonitor />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import SpectrumMonitor from './components/SpectrumMonitor.vue'
import LevelMonitor from './components/LevelMonitor.vue'

const activeTab = ref('spectrum')
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
