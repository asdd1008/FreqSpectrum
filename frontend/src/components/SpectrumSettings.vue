<template>
  <div class="settings-panel">
    <el-collapse v-model="activeNames">
      <el-collapse-item title="频谱监测参数" name="spectrum">
        <el-form label-position="top" size="small">
          <el-form-item label="中心频率 (Hz)">
            <el-input-number v-model="config.centerFreq" :min="1000000" :max="10000000000" :step="1000000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="扫频带宽 (Hz)">
            <el-input-number v-model="config.span" :min="100000" :max="1000000000" :step="1000000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="频率分辨率 (Hz)">
            <el-input-number v-model="config.freqResolution" :min="1000" :max="1200000" :step="1000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="增益 (dB)">
            <el-input-number v-model="config.gain" :min="0" :max="60" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="频谱采集">
            <el-switch v-model="config.enabled" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="显示扫频参数">
            <el-switch v-model="config.showSweepParams" active-text="显示" inactive-text="隐藏" />
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item title="电平监测参数" name="level">
        <el-form label-position="top" size="small">
          <el-form-item label="监测通道">
            <el-select v-model="levelConfig.channel" style="width: 100%">
              <el-option label="通道 1" :value="1" />
              <el-option label="通道 2" :value="2" />
              <el-option label="通道 3" :value="3" />
            </el-select>
          </el-form-item>
          <el-form-item label="中心频率 (Hz)">
            <el-input-number v-model="levelConfig.centerFreq" :min="1000000" :max="10000000000" :step="1000000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="扫频带宽 (Hz)">
            <el-input-number v-model="levelConfig.span" :min="100000" :max="1000000000" :step="1000000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="频率分辨率 (Hz)">
            <el-input-number v-model="levelConfig.freqResolution" :min="1000" :max="1200000" :step="1000" style="width: 100%" />
          </el-form-item>
          <el-form-item label="报警电平 (dBm)">
            <el-input-number v-model="levelConfig.alarmLevel" :min="-120" :max="20" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="电平监测">
            <el-switch v-model="levelConfig.enabled" active-text="开启" inactive-text="关闭" />
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item title="扫频参数设置" name="sweep">
        <el-form label-position="top" size="small">
          <el-form-item label="扫频模式">
            <el-radio-group v-model="config.sweepMode">
              <el-radio value="sweep">扫频</el-radio>
              <el-radio value="fixed">定频</el-radio>
            </el-radio-group>
          </el-form-item>
          <template v-if="config.sweepMode === 'sweep'">
            <el-form-item label="起始频率 (Hz)">
              <el-input-number v-model="config.startFreq" :min="1000000" :max="10000000000" :step="1000000" style="width: 100%" />
            </el-form-item>
            <el-form-item label="结束频率 (Hz)">
              <el-input-number v-model="config.endFreq" :min="1000000" :max="10000000000" :step="1000000" style="width: 100%" />
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item label="中心频率 (Hz)">
              <el-input-number v-model="config.centerFreq" :min="1000000" :max="10000000000" :step="1000000" style="width: 100%" />
            </el-form-item>
            <el-form-item label="扫描带宽 (Hz)">
              <el-input-number v-model="config.span" :min="100000" :max="1200000" :step="100000" style="width: 100%" />
            </el-form-item>
          </template>
          <el-form-item label="扫描速度 (ms)">
            <el-input-number v-model="config.sweepTime" :min="10" :max="10000" :step="10" style="width: 100%" />
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item title="参考电平参数" name="ref">
        <el-form label-position="top" size="small">
          <el-form-item label="参考电平 (dBm)">
            <el-input-number v-model="config.refLevel" :min="-50" :max="30" :step="1" style="width: 100%" />
          </el-form-item>
          <el-form-item label="分辨率带宽 (Hz)">
            <el-input-number v-model="config.rbw" :min="100" :max="10000000" :step="100" style="width: 100%" />
          </el-form-item>
          <el-form-item label="视频带宽 (Hz)">
            <el-input-number v-model="config.vbw" :min="100" :max="10000000" :step="100" style="width: 100%" />
          </el-form-item>
        </el-form>
      </el-collapse-item>

      <el-collapse-item title="显示设置" name="display">
        <el-form label-position="top" size="small">
          <el-form-item label="渲染方式">
            <el-radio-group v-model="config.useWebGL" @change="onRendererChange">
              <el-radio :value="false">Canvas</el-radio>
              <el-radio :value="true">WebGL</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="瀑布图">
            <el-switch v-model="config.waterfallEnabled" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="瀑布图高度 (px)">
            <el-slider v-model="config.waterfallHeight" :min="100" :max="400" :step="10" show-input />
          </el-form-item>
          <el-form-item label="最大保持">
            <el-switch v-model="config.maxHold" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="最小保持">
            <el-switch v-model="config.minHold" active-text="开启" inactive-text="关闭" />
          </el-form-item>
          <el-form-item label="平均保持">
            <el-switch v-model="config.avgHold" active-text="开启" inactive-text="关闭" />
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  config: {
    type: Object,
    required: true
  },
  levelConfig: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update:config', 'update:levelConfig', 'rendererChange'])

const activeNames = ref(['spectrum', 'sweep', 'ref'])

const onRendererChange = (val) => {
  emit('rendererChange', val)
}

watch(() => props.config, (newVal) => {
  emit('update:config', newVal)
}, { deep: true })

watch(() => props.levelConfig, (newVal) => {
  emit('update:levelConfig', newVal)
}, { deep: true })
</script>

<style scoped>
.settings-panel {
  padding: 10px;
}

:deep(.el-collapse) {
  --el-collapse-border-color: #1e4976;
  --el-collapse-header-bg-color: #0d2137;
  --el-collapse-content-bg-color: #0a1929;
  --el-collapse-header-text-color: #66b2ff;
  --el-collapse-content-text-color: #e0e0e0;
}

:deep(.el-collapse-item__header) {
  background: #0d2137;
  border-bottom: 1px solid #1e4976;
  color: #66b2ff;
  font-size: 13px;
  font-weight: 500;
}

:deep(.el-collapse-item__content) {
  background: #0a1929;
  color: #e0e0e0;
  padding-bottom: 10px;
}

:deep(.el-form-item__label) {
  color: #a0a0a0 !important;
  font-size: 12px;
}

:deep(.el-input-number) {
  --el-input-bg-color: #0d2137;
  --el-input-border-color: #1e4976;
  --el-input-text-color: #e0e0e0;
}

:deep(.el-input) {
  --el-input-bg-color: #0d2137;
  --el-input-border-color: #1e4976;
  --el-input-text-color: #e0e0e0;
}

:deep(.el-select) {
  --el-select-border-color-hover: #3a6b9c;
}

:deep(.el-radio) {
  --el-radio-text-color: #e0e0e0;
}

:deep(.el-slider) {
  --el-slider-main-bg-color: #3a6b9c;
}
</style>
