<template>
  <div class="level-container">
    <div class="level-header">
      <span class="title">
        <el-icon><Odometer /></el-icon>
        电平监测
      </span>
      <div class="header-info">
        <span class="channel-tag">通道 {{ levelConfig.channel }}</span>
        <el-tag :type="levelConfig.enabled ? 'success' : 'danger'" size="small">
          {{ levelConfig.enabled ? '监测中' : '已停止' }}
        </el-tag>
      </div>
    </div>

    <div class="level-main">
      <div class="level-content">
        <div class="meter-section">
          <div class="meter-wrapper">
            <div class="meter-scale">
              <div v-for="(tick, i) in scaleTicks" :key="i" class="tick">
                <span class="tick-label">{{ tick.label }}</span>
                <div class="tick-line"></div>
              </div>
            </div>
            <div class="meter-bar-container">
              <div class="meter-bar-bg"></div>
              <div 
                class="meter-bar-fill"
                :style="{ 
                  height: barHeight + '%',
                  background: barGradient
                }"
              ></div>
              <div class="meter-peak-marker" :style="{ bottom: peakHeight + '%' }">
                <span>{{ currentPeak.toFixed(1) }}</span>
              </div>
            </div>
            <div class="meter-scale right">
              <div v-for="(tick, i) in scaleTicks" :key="i" class="tick">
                <div class="tick-line"></div>
                <span class="tick-label">{{ tick.label }}</span>
              </div>
            </div>
          </div>
          <div class="meter-labels">
            <div class="current-level">
              <span class="label">当前电平</span>
              <span class="value" :class="{ alarm: isAlarming }">
                {{ currentLevel.toFixed(2) }} dBm
              </span>
            </div>
            <div class="peak-level">
              <span class="label">峰值电平</span>
              <span class="value peak">{{ currentPeak.toFixed(2) }} dBm</span>
            </div>
          </div>
        </div>

        <div class="history-section">
          <div class="section-title">历史电平曲线</div>
          <div class="history-chart-wrapper">
            <canvas ref="historyCanvas" class="history-canvas"></canvas>
          </div>
        </div>

        <div class="info-section">
          <div class="info-grid">
            <div class="info-card">
              <div class="info-card-label">中心频率</div>
              <div class="info-card-value">{{ formatFreq(levelConfig.centerFreq) }}</div>
            </div>
            <div class="info-card">
              <div class="info-card-label">扫频带宽</div>
              <div class="info-card-value">{{ formatFreq(levelConfig.span) }}</div>
            </div>
            <div class="info-card">
              <div class="info-card-label">频率分辨率</div>
              <div class="info-card-value">{{ formatFreq(levelConfig.freqResolution) }}</div>
            </div>
            <div class="info-card">
              <div class="info-card-label">报警电平</div>
              <div class="info-card-value alarm">{{ levelConfig.alarmLevel }} dBm</div>
            </div>
            <div class="info-card">
              <div class="info-card-label">参考电平</div>
              <div class="info-card-value">{{ levelConfig.refLevel }} dBm</div>
            </div>
            <div class="info-card">
              <div class="info-card-label">分辨率带宽</div>
              <div class="info-card-value">{{ formatFreq(levelConfig.rbw) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="level-settings">
        <el-collapse v-model="activeNames">
          <el-collapse-item title="电平参数设置" name="level">
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
                <el-input-number v-model="levelConfig.span" :min="100000" :max="1200000" :step="100000" style="width: 100%" />
              </el-form-item>
              <el-form-item label="频率分辨率 (Hz)">
                <el-input-number v-model="levelConfig.freqResolution" :min="1000" :max="1000000" :step="1000" style="width: 100%" />
              </el-form-item>
              <el-form-item label="报警电平 (dBm)">
                <el-input-number v-model="levelConfig.alarmLevel" :min="-120" :max="20" :step="1" style="width: 100%" />
              </el-form-item>
              <el-form-item label="电平监测开关">
                <el-switch v-model="levelConfig.enabled" active-text="开启" inactive-text="关闭" />
              </el-form-item>
            </el-form>
          </el-collapse-item>

          <el-collapse-item title="参考电平参数" name="ref">
            <el-form label-position="top" size="small">
              <el-form-item label="参考电平 (dBm)">
                <el-input-number v-model="levelConfig.refLevel" :min="-50" :max="30" :step="1" style="width: 100%" />
              </el-form-item>
              <el-form-item label="分辨率带宽 (Hz)">
                <el-input-number v-model="levelConfig.rbw" :min="100" :max="10000000" :step="100" style="width: 100%" />
              </el-form-item>
              <el-form-item label="视频带宽 (Hz)">
                <el-input-number v-model="levelConfig.vbw" :min="100" :max="10000000" :step="100" style="width: 100%" />
              </el-form-item>
            </el-form>
          </el-collapse-item>

          <el-collapse-item title="报警设置" name="alarm">
            <el-form label-position="top" size="small">
              <el-form-item label="报警声音">
                <el-switch v-model="alarmSound" active-text="开启" inactive-text="关闭" />
              </el-form-item>
              <el-form-item label="报警记录">
                <el-switch v-model="alarmLog" active-text="开启" inactive-text="关闭" />
              </el-form-item>
              <el-form-item label="保持时间 (ms)">
                <el-input-number v-model="alarmHoldTime" :min="100" :max="10000" :step="100" style="width: 100%" />
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <div v-if="isAlarming" class="alarm-banner">
      <el-icon class="alarm-icon"><Warning /></el-icon>
      <span>电平超限报警！当前电平: {{ currentLevel.toFixed(2) }} dBm，报警阈值: {{ levelConfig.alarmLevel }} dBm</span>
    </div>
  </div>
</template>

<script setup>import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { defaultLevelConfig, formatFreq } from '../utils/spectrumUtils.js';
import { wsManager } from '../utils/websocket.js';
const props = defineProps({
 config: {
 type: Object,
 default: () => ({})
 }
});
const emit = defineEmits(['alarm', 'levelUpdate']);
const historyCanvas = ref(null);
let historyCtx = null;
let dataTimer = null;
const levelConfig = reactive({ ...defaultLevelConfig, ...props.config });
const currentLevel = ref(-80);
const currentPeak = ref(-80);
const peakHoldTime = ref(0);
const isAlarming = ref(false);
const historyData = ref([]);
const maxHistoryPoints = 100;
const activeNames = ref(['level', 'ref']);
const alarmSound = ref(true);
const alarmLog = ref(true);
const alarmHoldTime = ref(2000);
const scaleTicks = computed(() => {
 const ticks = [];
 const min = levelConfig.refLevel - 100;
 const max = levelConfig.refLevel;
 const step = 10;
 for (let i = max; i >= min; i -= step) {
 ticks.push({ label: i + '', value: i });
 }
 return ticks;
});
const barHeight = computed(() => {
 const min = levelConfig.refLevel - 100;
 const max = levelConfig.refLevel;
 const range = max - min;
 const clamped = Math.max(min, Math.min(max, currentLevel.value));
 return ((clamped - min) / range) * 100;
});
const peakHeight = computed(() => {
 const min = levelConfig.refLevel - 100;
 const max = levelConfig.refLevel;
 const range = max - min;
 const clamped = Math.max(min, Math.min(max, currentPeak.value));
 return ((clamped - min) / range) * 100;
});
const barGradient = computed(() => {
 if (isAlarming.value) {
 return 'linear-gradient(to top, #ff4444, #ff6666, #ff8888)';
 }
 return 'linear-gradient(to top, #00ff88, #00ddff, #66b2ff)';
});
const generateLevelData = () => {
 if (!levelConfig.enabled)
 return;
 const baseLevel = -60;
 const noise = (Math.random() - 0.5) * 20;
 const signal = Math.sin(Date.now() / 1000) * 10;
 const newLevel = baseLevel + noise + signal;
 currentLevel.value = newLevel;
 if (newLevel > currentPeak.value) {
 currentPeak.value = newLevel;
 peakHoldTime.value = Date.now();
 }
 else if (Date.now() - peakHoldTime.value > alarmHoldTime.value) {
 currentPeak.value = newLevel;
 }
 const isAlarm = newLevel > levelConfig.alarmLevel;
 if (isAlarm && !isAlarming.value) {
 isAlarming.value = true;
 emit('alarm', { level: newLevel, threshold: levelConfig.alarmLevel });
 }
 else if (!isAlarm && isAlarming.value) {
 isAlarming.value = false;
 }
 historyData.value.push({
 time: Date.now(),
 level: newLevel
 });
 if (historyData.value.length > maxHistoryPoints) {
 historyData.value.shift();
 }
 drawHistoryChart();
 emit('levelUpdate', { level: newLevel, peak: currentPeak.value });
};
const drawHistoryChart = () => {
 if (!historyCtx || !historyCanvas.value)
 return;
 const canvas = historyCanvas.value;
 const ctx = historyCtx;
 const width = canvas.width;
 const height = canvas.height;
 const padding = { top: 20, right: 20, bottom: 30, left: 50 };
 const plotWidth = width - padding.left - padding.right;
 const plotHeight = height - padding.top - padding.bottom;
 ctx.clearRect(0, 0, width, height);
 ctx.fillStyle = '#000';
 ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);
 ctx.strokeStyle = '#1a3a5c';
 ctx.lineWidth = 0.5;
 const gridCountY = 5;
 for (let i = 0; i <= gridCountY; i++) {
 const y = padding.top + (plotHeight / gridCountY) * i;
 ctx.beginPath();
 ctx.moveTo(padding.left, y);
 ctx.lineTo(padding.left + plotWidth, y);
 ctx.stroke();
 const min = levelConfig.refLevel - 100;
 const max = levelConfig.refLevel;
 const level = max - (max - min) * (i / gridCountY);
 ctx.fillStyle = '#a0a0a0';
 ctx.font = '10px monospace';
 ctx.textAlign = 'right';
 ctx.textBaseline = 'middle';
 ctx.fillText(level.toFixed(0) + ' dBm', padding.left - 5, y);
 }
 ctx.strokeStyle = '#ff6666';
 ctx.setLineDash([5, 3]);
 const alarmRatio = (levelConfig.alarmLevel - (levelConfig.refLevel - 100)) / 100;
 const alarmY = padding.top + plotHeight * (1 - Math.max(0, Math.min(1, alarmRatio)));
 ctx.beginPath();
 ctx.moveTo(padding.left, alarmY);
 ctx.lineTo(padding.left + plotWidth, alarmY);
 ctx.stroke();
 ctx.setLineDash([]);
 if (historyData.value.length > 1) {
 ctx.strokeStyle = '#00ff88';
 ctx.lineWidth = 1.5;
 ctx.beginPath();
 const min = levelConfig.refLevel - 100;
 const max = levelConfig.refLevel;
 for (let i = 0; i < historyData.value.length; i++) {
 const x = padding.left + (plotWidth / (maxHistoryPoints - 1)) * (maxHistoryPoints - historyData.value.length + i);
 const ratio = (historyData.value[i].level - min) / (max - min);
 const y = padding.top + plotHeight * (1 - Math.max(0, Math.min(1, ratio)));
 if (i === 0) {
 ctx.moveTo(x, y);
 }
 else {
 ctx.lineTo(x, y);
 }
 }
 ctx.stroke();
 }
 ctx.strokeStyle = '#3a6b9c';
 ctx.lineWidth = 1;
 ctx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);
};
const resizeCanvas = () => {
 if (!historyCanvas.value)
 return;
 const canvas = historyCanvas.value;
 const rect = canvas.getBoundingClientRect();
 const dpr = window.devicePixelRatio || 1;
 canvas.width = rect.width * dpr;
 canvas.height = rect.height * dpr;
 historyCtx = canvas.getContext('2d');
 historyCtx.scale(dpr, dpr);
 drawHistoryChart();
};
const startDataLoop = () => {
 if (dataTimer)
 clearInterval(dataTimer);
 dataTimer = setInterval(generateLevelData, 100);
};
const stopDataLoop = () => {
 if (dataTimer) {
 clearInterval(dataTimer);
 dataTimer = null;
 }
};
watch(() => levelConfig.enabled, (enabled) => {
 if (enabled) {
 startDataLoop();
 }
 else {
 stopDataLoop();
 }
});
onMounted(async () => {
 resizeCanvas();
 if (levelConfig.enabled) {
 startDataLoop();
 }
 window.addEventListener('resize', resizeCanvas);
 try {
 await wsManager.connect('ws://localhost:3000/ws');
 wsManager.send('subscribe', { channel: 'level' });
 wsManager.subscribe('levelData', (data) => {
 if (levelConfig.enabled && data.channel === levelConfig.channel) {
 stopDataLoop();
 currentLevel.value = data.level;
 if (data.level > currentPeak.value) {
 currentPeak.value = data.level;
 peakHoldTime.value = Date.now();
 }
 const isAlarm = data.level > levelConfig.alarmLevel;
 if (isAlarm && !isAlarming.value) {
 isAlarming.value = true;
 emit('alarm', { level: data.level, threshold: levelConfig.alarmLevel });
 }
 else if (!isAlarm && isAlarming.value) {
 isAlarming.value = false;
 }
 historyData.value.push({
 time: Date.now(),
 level: data.level
 });
 if (historyData.value.length > maxHistoryPoints) {
 historyData.value.shift();
 }
 drawHistoryChart();
 }
 });
 }
 catch (e) {
 console.log('WebSocket not available');
 }
});
onUnmounted(() => {
 stopDataLoop();
 window.removeEventListener('resize', resizeCanvas);
});
</script>

<style scoped>
.level-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a1929;
}

.level-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: linear-gradient(180deg, #132f4c 0%, #0a1929 100%);
  border-bottom: 1px solid #1e4976;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #66b2ff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.channel-tag {
  padding: 4px 12px;
  background: #1e4976;
  border-radius: 4px;
  font-size: 13px;
  color: #66b2ff;
}

.level-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.level-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
  overflow-y: auto;
}

.meter-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 20px;
  background: #0d2137;
  border: 1px solid #1e4976;
  border-radius: 8px;
}

.meter-wrapper {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.meter-scale {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 5px 0;
  width: 50px;
}

.meter-scale.right {
  align-items: flex-end;
}

.tick {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-family: monospace;
  color: #a0a0a0;
}

.meter-scale.right .tick {
  flex-direction: row-reverse;
}

.tick-label {
  min-width: 40px;
  text-align: right;
}

.meter-scale.right .tick-label {
  text-align: left;
}

.tick-line {
  width: 8px;
  height: 1px;
  background: #3a6b9c;
}

.meter-bar-container {
  width: 60px;
  height: 400px;
  position: relative;
  border: 2px solid #1e4976;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
}

.meter-bar-bg {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  top: 0;
  background: #0a1929;
}

.meter-bar-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  transition: height 0.05s ease-out;
  box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
}

.meter-peak-marker {
  position: absolute;
  left: -5px;
  right: -5px;
  height: 2px;
  background: #ffeb3b;
  z-index: 10;
}

.meter-peak-marker span {
  position: absolute;
  top: -12px;
  right: -45px;
  font-size: 10px;
  font-family: monospace;
  color: #ffeb3b;
  white-space: nowrap;
}

.meter-labels {
  display: flex;
  gap: 40px;
}

.current-level,
.peak-level {
  text-align: center;
}

.label {
  font-size: 12px;
  color: #a0a0a0;
  display: block;
  margin-bottom: 5px;
}

.value {
  font-size: 24px;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  color: #00ff88;
}

.value.peak {
  color: #ffeb3b;
}

.value.alarm {
  color: #ff4444;
  animation: pulse 0.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  background: #0d2137;
  border: 1px solid #1e4976;
  border-radius: 8px;
  padding: 15px;
}

.section-title {
  font-size: 14px;
  color: #66b2ff;
  margin-bottom: 10px;
  font-weight: 500;
}

.history-chart-wrapper {
  flex: 1;
  min-height: 150px;
}

.history-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.info-section {
  background: #0d2137;
  border: 1px solid #1e4976;
  border-radius: 8px;
  padding: 15px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
}

.info-card {
  background: #0a1929;
  border: 1px solid #1e4976;
  border-radius: 6px;
  padding: 12px;
  text-align: center;
}

.info-card-label {
  font-size: 12px;
  color: #a0a0a0;
  margin-bottom: 6px;
}

.info-card-value {
  font-size: 14px;
  font-weight: 500;
  font-family: 'Courier New', monospace;
  color: #66b2ff;
}

.info-card-value.alarm {
  color: #ff6666;
}

.level-settings {
  width: 320px;
  border-left: 1px solid #1e4976;
  background: #0d2137;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 10px;
}

.alarm-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  background: linear-gradient(90deg, #cc0000, #ff4444, #cc0000);
  color: white;
  font-weight: 500;
  animation: alarmFlash 1s ease-in-out infinite;
}

.alarm-icon {
  font-size: 20px;
}

@keyframes alarmFlash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
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
</style>
