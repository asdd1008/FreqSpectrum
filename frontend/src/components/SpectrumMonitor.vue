<template>
  <div class="spectrum-container">
    <div class="spectrum-header">
      <div class="header-left">
        <span class="title">
          <el-icon><Monitor /></el-icon>
          频谱监测系统
        </span>
      </div>
      <div class="header-center">
        <div class="info-bar">
          <div class="info-item">
            <span class="info-label">中心频率:</span>
            <span class="info-value">{{ formatFreq(spectrumConfig.centerFreq) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">带宽:</span>
            <span class="info-value">{{ formatFreq(spectrumConfig.span) }}</span>
          </div>
          <div class="info-item" v-if="spectrumConfig.showSweepParams">
            <span class="info-label">RBW:</span>
            <span class="info-value">{{ formatFreq(spectrumConfig.rbw) }}</span>
          </div>
          <div class="info-item" v-if="spectrumConfig.showSweepParams">
            <span class="info-label">VBW:</span>
            <span class="info-value">{{ formatFreq(spectrumConfig.vbw) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">参考电平:</span>
            <span class="info-value">{{ spectrumConfig.refLevel }} dBm</span>
          </div>
          <div class="info-item">
            <span class="info-label">当前峰值:</span>
            <span class="info-value peak">{{ stats.max.toFixed(2) }} dBm</span>
          </div>
        </div>
      </div>
      <div class="header-right">
        <el-button-group>
          <el-button size="small" :type="isPlaying ? 'success' : 'primary'" @click="togglePlay">
            <el-icon><component :is="isPlaying ? 'Pause' : 'VideoPlay'" /></el-icon>
            {{ isPlaying ? '暂停' : '开始' }}
          </el-button>
          <el-button size="small" @click="takeSnapshot">
            <el-icon><Camera /></el-icon>
            快照
          </el-button>
          <el-button size="small" @click="showMarkersDialog = true">
            <el-icon><Flag /></el-icon>
            标记
          </el-button>
          <el-button size="small" @click="toggleRecording">
            <el-icon><VideoCamera /></el-icon>
            {{ isRecording ? '停止录制' : '录制' }}
          </el-button>
        </el-button-group>
      </div>
    </div>

    <div class="spectrum-main">
      <div class="spectrum-content">
        <div class="canvas-wrapper spectrum-canvas-wrapper" ref="canvasWrapper">
          <canvas ref="spectrumCanvas" class="spectrum-canvas"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @click="onCanvasClick"
            @contextmenu.prevent="onContextMenu"
          ></canvas>
          <div v-if="levelIndicatorPos" class="level-indicator-info">
            <div>频率: {{ formatFreq(levelIndicatorPos.freq || 0) }}</div>
            <div>电平: {{ (levelIndicatorPos.level || 0).toFixed(2) }} dBm</div>
          </div>
        </div>

        <div class="info-bar bottom-bar">
          <div class="info-item">
            <span class="info-label">L频率:</span>
            <span class="info-value">{{ formatFreq(lFrequency) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">本振:</span>
            <span class="info-value">{{ formatFreq(localOscillator) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">最小值:</span>
            <span class="info-value">{{ stats.min.toFixed(2) }} dBm</span>
          </div>
          <div class="info-item">
            <span class="info-label">平均值:</span>
            <span class="info-value">{{ stats.avg.toFixed(2) }} dBm</span>
          </div>
          <div class="info-item">
            <span class="info-label">数据点数:</span>
            <span class="info-value">{{ dataPoints }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">瀑布线数:</span>
            <span class="info-value">{{ waterfallLines }}</span>
          </div>
          <div class="info-item" v-if="boxSelectResult">
            <span class="info-label">框选区域峰值:</span>
            <span class="info-value peak">{{ boxSelectResult.overallStats?.max.toFixed(2) }} dBm</span>
          </div>
        </div>

        <div class="playback-controls" v-if="isPlaybackMode">
          <el-button-group>
            <el-button size="small" @click="prevFrame">
              <el-icon><ArrowLeft /></el-icon>
            </el-button>
            <el-button size="small" @click="togglePlayback">
              <el-icon><component :is="isPlaybackPlaying ? 'Pause' : 'VideoPlay'" /></el-icon>
              {{ isPlaybackPlaying ? '暂停' : '播放' }}
            </el-button>
            <el-button size="small" @click="nextFrame">
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </el-button-group>
          <el-select v-model="playMode" size="small" style="width: 120px">
            <el-option label="顺序播放" value="sequence" />
            <el-option label="循环播放" value="loop" />
            <el-option label="随机播放" value="random" />
          </el-select>
          <span class="playback-info">
            帧: {{ playbackFrame + 1 }} / {{ playbackData.length }}
          </span>
          <el-slider v-model="playbackFrame" :max="playbackData.length - 1" :step="1" style="flex: 1; margin: 0 20px" />
          <el-button size="small" @click="exitPlayback">
            <el-icon><Close /></el-icon>
            退出回放
          </el-button>
        </div>
      </div>

      <div class="spectrum-settings">
        <SpectrumSettings
          v-model:config="spectrumConfig"
          v-model:levelConfig="levelConfig"
          @rendererChange="onRendererChange"
        />
      </div>
    </div>

    <el-dialog v-model="showMarkersDialog" title="频谱标记" width="500px">
      <div class="markers-list">
        <div v-if="markers.length === 0" class="empty-tip">暂无标记</div>
        <div v-for="marker in markers" :key="marker.id" class="marker-item">
          <div class="marker-info">
            <span class="marker-id">M{{ marker.id }}</span>
            <span>{{ formatFreq(marker.freq) }}</span>
            <span>{{ marker.level?.toFixed(2) }} dBm</span>
          </div>
          <el-input
            v-model="marker.note"
            placeholder="添加备注..."
            size="small"
            style="flex: 1; margin: 0 10px"
          />
          <el-button size="small" type="danger" @click="removeMarker(marker.id)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="clearAllMarkers">清除所有</el-button>
        <el-button type="primary" @click="showMarkersDialog = false">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSnapshotDialog" title="频谱快照" width="600px">
      <img :src="snapshotUrl" style="width: 100%; border: 1px solid #1e4976" />
      <template #footer>
        <el-button @click="downloadSnapshot">下载</el-button>
        <el-button type="primary" @click="showSnapshotDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBoxSelectDialog" title="瀑布图框选分析" width="600px">
      <div v-if="boxSelectResult" class="box-select-info">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="起始频率">{{ formatFreq(boxSelectResult.bounds.freqStart || 0) }}</el-descriptions-item>
          <el-descriptions-item label="结束频率">{{ formatFreq(boxSelectResult.bounds.freqEnd || 0) }}</el-descriptions-item>
          <el-descriptions-item label="最大电平">{{ boxSelectResult.overallStats?.max.toFixed(2) }} dBm</el-descriptions-item>
          <el-descriptions-item label="最小电平">{{ boxSelectResult.overallStats?.min.toFixed(2) }} dBm</el-descriptions-item>
          <el-descriptions-item label="平均电平">{{ boxSelectResult.overallStats?.avg.toFixed(2) }} dBm</el-descriptions-item>
          <el-descriptions-item label="数据线数">{{ boxSelectResult.overallStats?.lineCount }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top: 15px; text-align: right">
          <el-button type="primary" @click="startPlayback">回放此区域</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import SpectrumSettings from './SpectrumSettings.vue';
import { SpectrumCanvasRenderer } from '../renderers/SpectrumCanvasRenderer.js';
import { SpectrumWebGLRenderer } from '../renderers/SpectrumWebGLRenderer.js';
import { defaultSpectrumConfig, defaultLevelConfig, formatFreq, generateSpectrumData, calcSpectrumStats } from '../utils/spectrumUtils.js';
import { wsManager } from '../utils/websocket.js';
const props = defineProps({
 subscribeParams: {
 type: Object,
 default: () => ({})
 }
});
const emit = defineEmits(['dataUpdate', 'markerAdd', 'markerRemove', 'levelIndicatorChange']);
const spectrumCanvas = ref(null);
const canvasWrapper = ref(null);
let renderer = null;
let worker = null;
let animationId = null;
let dataTimer = null;
const spectrumConfig = reactive({ ...defaultSpectrumConfig, enabled: true });
const levelConfig = reactive({ ...defaultLevelConfig });
const isPlaying = ref(true);
const isRecording = ref(false);
const showMarkersDialog = ref(false);
const showSnapshotDialog = ref(false);
const showBoxSelectDialog = ref(false);
const snapshotUrl = ref('');
const markers = ref([]);
const stats = reactive({ max: -100, min: -100, avg: -100, maxIndex: 0, minIndex: 0 });
const dataPoints = ref(1024);
const waterfallLines = ref(0);
const levelIndicatorPos = ref(null);
const boxSelection = ref(null);
const boxSelectResult = ref(null);
const isMouseDown = ref(false);
const mouseDownPos = null;
const isPlaybackMode = ref(false);
const isPlaybackPlaying = ref(false);
const playbackFrame = ref(0);
const playbackData = ref([]);
const playMode = ref('sequence');
let playbackTimer = null;
const lFrequency = computed(() => {
 return spectrumConfig.centerFreq;
});
const localOscillator = computed(() => {
 return spectrumConfig.centerFreq - 10700000;
});
const initWorker = () => {
 worker = new Worker(new URL('../workers/spectrum.worker.js', import.meta.url), {
 type: 'module'
 });
 worker.onmessage = (e) => {
 const { type, data } = e.data;
 switch (type) {
 case 'spectrumProcessed':
 handleWorkerData(data);
 break;
 case 'boxSelectResult':
 handleBoxSelectResult(data);
 break;
 case 'recordingStarted':
 ElMessage.success('开始录制');
 break;
 case 'recordingStopped':
 ElMessage.success(`录制完成，共 ${data.frames} 帧，时长 ${data.duration.toFixed(1)} 秒`);
 break;
 }
 };
 const points = Math.floor(spectrumConfig.span / spectrumConfig.freqResolution);
 worker.postMessage({
 type: 'init',
 config: {
 span: spectrumConfig.span,
 freqResolution: spectrumConfig.freqResolution,
 waterfallMaxLines: 200,
 minLevel: spectrumConfig.refLevel - 100,
 maxLevel: spectrumConfig.refLevel
 }
 });
};
const initRenderer = (useWebGL = false) => {
 if (renderer) {
 renderer = null;
 }
 try {
 if (useWebGL) {
 renderer = new SpectrumWebGLRenderer(spectrumCanvas.value, {
 waterfallHeight: spectrumConfig.waterfallHeight
 });
 }
 else {
 renderer = new SpectrumCanvasRenderer(spectrumCanvas.value, {
 waterfallHeight: spectrumConfig.waterfallHeight
 });
 }
 renderer.setConfig({
 centerFreq: spectrumConfig.centerFreq,
 span: spectrumConfig.span,
 refLevel: spectrumConfig.refLevel,
 waterfallHeight: spectrumConfig.waterfallHeight
 });
 }
 catch (e) {
 console.error('WebGL not supported, falling back to Canvas:', e);
 renderer = new SpectrumCanvasRenderer(spectrumCanvas.value, {
 waterfallHeight: spectrumConfig.waterfallHeight
 });
 spectrumConfig.useWebGL = false;
 ElMessage.warning('WebGL不支持，已切换到Canvas渲染');
 }
};
const handleWorkerData = (data) => {
 const spectrum = new Float32Array(data.spectrum);
 const maxHold = data.maxHold ? new Float32Array(data.maxHold) : null;
 const minHold = data.minHold ? new Float32Array(data.minHold) : null;
 const avg = data.avg ? new Float32Array(data.avg) : null;
 if (data.stats) {
 Object.assign(stats, data.stats);
 }
 waterfallLines.value = data.waterfallLines || 0;
 dataPoints.value = spectrum.length;
 if (renderer) {
 const renderData = { spectrum };
 if (spectrumConfig.maxHold)
 renderData.maxHold = maxHold;
 if (spectrumConfig.minHold)
 renderData.minHold = minHold;
 if (spectrumConfig.avgHold)
 renderData.avg = avg;
 if (spectrumConfig.waterfallEnabled) {
 renderData.waterfall = data.waterfall;
 }
 renderer.setData(renderData);
 }
 emit('dataUpdate', { spectrum, stats, waterfall: data.waterfall });
};
const generateMockData = () => {
 if (!isPlaying.value || isPlaybackMode.value)
 return;
 const points = Math.floor(spectrumConfig.span / spectrumConfig.freqResolution);
 const minLevel = spectrumConfig.refLevel - 100;
 const maxLevel = spectrumConfig.refLevel;
 const data = generateSpectrumData(points, minLevel, maxLevel, spectrumConfig.centerFreq, spectrumConfig.span);
 if (worker) {
 worker.postMessage({
 type: 'processSpectrum',
 data: data
 });
 }
 else {
 const s = calcSpectrumStats(data);
 Object.assign(stats, s);
 dataPoints.value = data.length;
 if (renderer) {
 renderer.setData({ spectrum: data });
 }
 }
};
const startDataLoop = () => {
 if (dataTimer)
 clearInterval(dataTimer);
 dataTimer = setInterval(generateMockData, spectrumConfig.sweepTime);
};
const stopDataLoop = () => {
 if (dataTimer) {
 clearInterval(dataTimer);
 dataTimer = null;
 }
};
const renderLoop = () => {
 if (renderer) {
 renderer.render();
 }
 animationId = requestAnimationFrame(renderLoop);
};
const onMouseDown = (e) => {
 const rect = spectrumCanvas.value.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 if (renderer?.isInWaterfall(x, y)) {
 isMouseDown.value = true;
 boxSelection.value = { startX: x, startY: y, endX: x, endY: y };
 renderer.setBoxSelection(boxSelection.value);
 }
};
const onMouseMove = (e) => {
 const rect = spectrumCanvas.value.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 if (isMouseDown.value && boxSelection.value) {
 boxSelection.value.endX = x;
 boxSelection.value.endY = y;
 if (renderer) {
 renderer.setBoxSelection(boxSelection.value);
 }
 }
};
const onMouseUp = (e) => {
 if (isMouseDown.value && boxSelection.value) {
 const rect = spectrumCanvas.value.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 boxSelection.value.endX = x;
 boxSelection.value.endY = y;
 const width = Math.abs(boxSelection.value.endX - boxSelection.value.startX);
 const height = Math.abs(boxSelection.value.endY - boxSelection.value.startY);
 if (width > 5 && height > 5) {
 performBoxSelect();
 }
 else {
 boxSelection.value = null;
 if (renderer)
 renderer.setBoxSelection(null);
 }
 }
 isMouseDown.value = false;
};
const onMouseLeave = () => {
 isMouseDown.value = false;
};
const onCanvasClick = (e) => {
 if (isMouseDown.value)
 return;
 const rect = spectrumCanvas.value.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 if (renderer && !renderer.isInWaterfall(x, y)) {
 levelIndicatorPos.value = { x, y };
 renderer.setLevelIndicator({ x, y });
 emit('levelIndicatorChange', { x, y });
 }
};
const onContextMenu = (e) => {
 const rect = spectrumCanvas.value.getBoundingClientRect();
 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 const points = dataPoints.value;
 const index = renderer?.getIndexAtX(x, points);
 if (index >= 0 && !renderer?.isInWaterfall(x, y)) {
 const freq = spectrumConfig.centerFreq - spectrumConfig.span / 2 + (index / (points - 1)) * spectrumConfig.span;
 const level = stats.max;
 markers.value.push({
 id: Date.now(),
 index,
 freq,
 level,
 note: ''
 });
 ElMessage.success('已添加标记');
 emit('markerAdd', { index, freq, level });
 }
};
const removeMarker = (id) => {
 markers.value = markers.value.filter(m => m.id !== id);
 emit('markerRemove', id);
};
const clearAllMarkers = () => {
 markers.value = [];
 ElMessage.info('已清除所有标记');
};
const performBoxSelect = () => {
 if (!renderer || !boxSelection.value)
 return;
 const pos1 = renderer.getWaterfallPos(boxSelection.value.startX, boxSelection.value.startY);
 const pos2 = renderer.getWaterfallPos(boxSelection.value.endX, boxSelection.value.endY);
 if (!pos1 || !pos2)
 return;
 if (worker) {
 worker.postMessage({
 type: 'boxSelectWaterfall',
 data: {
 startX: Math.min(pos1.indexX, pos2.indexX),
 endX: Math.max(pos1.indexX, pos2.indexX),
 startY: Math.min(pos1.indexY, pos2.indexY),
 endY: Math.max(pos1.indexY, pos2.indexY)
 }
 });
 }
};
const handleBoxSelectResult = (data) => {
 boxSelectResult.value = data;
 const points = dataPoints.value;
 data.bounds.freqStart = spectrumConfig.centerFreq - spectrumConfig.span / 2 + (data.bounds.xStart / (points - 1)) * spectrumConfig.span;
 data.bounds.freqEnd = spectrumConfig.centerFreq - spectrumConfig.span / 2 + (data.bounds.xEnd / (points - 1)) * spectrumConfig.span;
 showBoxSelectDialog.value = true;
};
const startPlayback = () => {
 if (!boxSelectResult.value)
 return;
 isPlaybackMode.value = true;
 playbackData.value = boxSelectResult.value.selected;
 playbackFrame.value = 0;
 isPlaybackPlaying.value = false;
 showBoxSelectDialog.value = false;
 boxSelection.value = null;
 if (renderer)
 renderer.setBoxSelection(null);
 ElMessage.info('进入回放模式');
};
const togglePlayback = () => {
 isPlaybackPlaying.value = !isPlaybackPlaying.value;
 if (isPlaybackPlaying.value) {
 startPlaybackLoop();
 }
 else {
 stopPlaybackLoop();
 }
};
const startPlaybackLoop = () => {
 if (playbackTimer)
 clearInterval(playbackTimer);
 playbackTimer = setInterval(() => {
 nextFrame();
 }, 100);
};
const stopPlaybackLoop = () => {
 if (playbackTimer) {
 clearInterval(playbackTimer);
 playbackTimer = null;
 }
};
const nextFrame = () => {
 if (playbackData.value.length === 0)
 return;
 switch (playMode.value) {
 case 'sequence':
 if (playbackFrame.value < playbackData.value.length - 1) {
 playbackFrame.value++;
 }
 else {
 isPlaybackPlaying.value = false;
 stopPlaybackLoop();
 }
 break;
 case 'loop':
 playbackFrame.value = (playbackFrame.value + 1) % playbackData.value.length;
 break;
 case 'random':
 playbackFrame.value = Math.floor(Math.random() * playbackData.value.length);
 break;
 }
 updatePlaybackDisplay();
};
const prevFrame = () => {
 if (playbackData.value.length === 0)
 return;
 if (playbackFrame.value > 0) {
 playbackFrame.value--;
 }
 else {
 playbackFrame.value = playbackData.value.length - 1;
 }
 updatePlaybackDisplay();
};
const updatePlaybackDisplay = () => {
 const frame = playbackData.value[playbackFrame.value];
 if (!frame || !renderer)
 return;
 renderer.setData({
 spectrum: frame.data
 });
 renderer.setTimeLine(playbackFrame.value);
 if (frame.stats) {
 Object.assign(stats, frame.stats);
 }
};
const exitPlayback = () => {
 isPlaybackMode.value = false;
 isPlaybackPlaying.value = false;
 stopPlaybackLoop();
 playbackData.value = [];
 playbackFrame.value = 0;
 if (renderer) {
 renderer.setTimeLine(0);
 }
 ElMessage.info('已退出回放模式');
};
const togglePlay = () => {
 isPlaying.value = !isPlaying.value;
};
const takeSnapshot = () => {
 if (renderer) {
 snapshotUrl.value = renderer.takeSnapshot();
 showSnapshotDialog.value = true;
 }
};
const downloadSnapshot = () => {
 const link = document.createElement('a');
 link.download = `spectrum-${Date.now()}.png`;
 link.href = snapshotUrl.value;
 link.click();
};
const toggleRecording = () => {
 if (!worker)
 return;
 isRecording.value = !isRecording.value;
 if (isRecording.value) {
 worker.postMessage({ type: 'startRecording' });
 }
 else {
 worker.postMessage({ type: 'stopRecording' });
 }
};
const onRendererChange = (useWebGL) => {
 initRenderer(useWebGL);
 ElMessage.success(`已切换到${useWebGL ? 'WebGL' : 'Canvas'}渲染`);
};
const handleResize = () => {
 if (renderer) {
 renderer.resize();
 }
};
watch(() => spectrumConfig.refLevel, (newVal) => {
 if (renderer) {
 renderer.setConfig({ refLevel: newVal });
 }
 if (worker) {
 worker.postMessage({
 type: 'updateConfig',
 config: {
 minLevel: newVal - 100,
 maxLevel: newVal
 }
 });
 }
});
watch(() => spectrumConfig.waterfallHeight, (newVal) => {
 if (renderer) {
 renderer.setConfig({ waterfallHeight: newVal });
 }
});
watch(() => spectrumConfig.centerFreq, (newVal) => {
 if (renderer) {
 renderer.setConfig({ centerFreq: newVal });
 }
});
watch(() => spectrumConfig.span, (newVal) => {
 if (renderer) {
 renderer.setConfig({ span: newVal });
 }
 if (worker) {
 const points = Math.floor(newVal / spectrumConfig.freqResolution);
 worker.postMessage({
 type: 'init',
 config: {
 span: newVal,
 freqResolution: spectrumConfig.freqResolution,
 waterfallMaxLines: 200,
 minLevel: spectrumConfig.refLevel - 100,
 maxLevel: spectrumConfig.refLevel
 }
 });
 }
});
watch(() => spectrumConfig.sweepTime, () => {
 if (isPlaying.value) {
 startDataLoop();
 }
});
watch(() => props.subscribeParams, (newParams) => {
 if (newParams.centerFreq)
 spectrumConfig.centerFreq = newParams.centerFreq;
 if (newParams.span)
 spectrumConfig.span = newParams.span;
 if (newParams.freqResolution)
 spectrumConfig.freqResolution = newParams.freqResolution;
}, { deep: true });
onMounted(async () => {
 await nextTick();
 initWorker();
 initRenderer(spectrumConfig.useWebGL);
 renderLoop();
 startDataLoop();
 window.addEventListener('resize', handleResize);
 try {
 await wsManager.connect('ws://localhost:3000/ws');
 wsManager.subscribe('spectrumData', (data) => {
 if (worker && isPlaying.value && !isPlaybackMode.value) {
 const floatData = new Float32Array(data.data);
 worker.postMessage({
 type: 'processSpectrum',
 data: floatData
 });
 }
 });
 }
 catch (e) {
 console.log('WebSocket连接失败，使用模拟数据');
 }
});
onUnmounted(() => {
 stopDataLoop();
 stopPlaybackLoop();
 if (animationId) {
 cancelAnimationFrame(animationId);
 }
 if (worker) {
 worker.terminate();
 worker = null;
 }
 window.removeEventListener('resize', handleResize);
 wsManager.disconnect();
});
</script>

<style scoped>
.spectrum-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a1929;
}

.spectrum-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: linear-gradient(180deg, #132f4c 0%, #0a1929 100%);
  border-bottom: 1px solid #1e4976;
  gap: 20px;
}

.header-left .title {
  font-size: 16px;
  font-weight: 600;
  color: #66b2ff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.spectrum-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.spectrum-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 10px;
  overflow: hidden;
}

.canvas-wrapper {
  position: relative;
  flex: 1;
  background: #000;
  border: 1px solid #1e4976;
  border-radius: 4px;
  overflow: hidden;
  min-height: 300px;
}

.spectrum-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}

.level-indicator-info {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid #ff5722;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  color: #ff5722;
}

.info-bar {
  display: flex;
  gap: 20px;
  padding: 8px 12px;
  background: #0d2137;
  border: 1px solid #1e4976;
  border-radius: 4px;
  font-size: 13px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-label {
  color: #66b2ff;
}

.info-value {
  color: #fff;
  font-family: 'Courier New', monospace;
}

.info-value.peak {
  color: #ff6b6b;
  font-weight: bold;
}

.bottom-bar {
  flex-shrink: 0;
}

.spectrum-settings {
  width: 340px;
  border-left: 1px solid #1e4976;
  background: #0d2137;
  overflow-y: auto;
  flex-shrink: 0;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px 15px;
  background: #132f4c;
  border: 1px solid #1e4976;
  border-radius: 4px;
}

.playback-info {
  font-size: 13px;
  color: #66b2ff;
  font-family: monospace;
  white-space: nowrap;
}

.markers-list {
  max-height: 400px;
  overflow-y: auto;
}

.empty-tip {
  text-align: center;
  padding: 40px;
  color: #888;
}

.marker-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #1e4976;
  gap: 8px;
}

.marker-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  font-family: monospace;
  min-width: 150px;
}

.marker-id {
  color: #ffeb3b;
  font-weight: bold;
}

.box-select-info {
  padding: 10px 0;
}
</style>
