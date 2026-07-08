<template>
  <div class="spectrum-container">
    <div class="spectrum-instances" ref="instancesContainer">
      <div 
        v-for="(instance, index) in instances" 
        :key="instance.id"
        class="spectrum-instance"
        :class="{ active: instance.id === activeInstanceId, fullscreen: instance.isFullscreen }"
        :style="getInstanceStyle(instance, index)"
        @click="setActiveInstance(instance.id)"
      >
        <div class="instance-toolbar">
          <div class="toolbar-left">
            <el-select v-model="instance.selectedPreset" size="small" placeholder="请选择" style="width: 140px">
              <el-option label="请选择" value="" />
              <el-option label="预设1" value="preset1" />
              <el-option label="预设2" value="preset2" />
              <el-option label="预设3" value="preset3" />
            </el-select>
          </div>
          <div class="toolbar-right">
            <div class="toolbar-buttons">
              <el-button 
                size="small" 
                :type="instance.config.waterfallEnabled ? 'primary' : 'default'" 
                @click.stop="toggleWaterfall(instance)"
              >
                瀑布图
              </el-button>
              <el-button 
                size="small" 
                :type="instance.config.maxHold ? 'primary' : 'default'" 
                @click.stop="toggleMaxHold(instance)"
              >
                高点
              </el-button>
              <el-button 
                size="small" 
                :type="instance.config.minHold ? 'primary' : 'default'" 
                @click.stop="toggleMinHold(instance)"
              >
                低点
              </el-button>
              <el-button 
                size="small" 
                :type="instance.isFullSample ? 'primary' : 'default'" 
                @click.stop="toggleSampleMode(instance)"
              >
                全样
              </el-button>
              <el-button 
                size="small" 
                :type="!instance.isFullSample ? 'primary' : 'default'" 
                @click.stop="toggleSampleMode(instance)"
              >
                抽样
              </el-button>
              <el-dropdown @command="(cmd) => handleSettingsCommand(cmd, instance)">
                <el-button size="small">
                  扫频设置
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="freqSettings">频率设置</el-dropdown-item>
                    <el-dropdown-item command="levelSettings">电平设置</el-dropdown-item>
                    <el-dropdown-item command="displaySettings">显示设置</el-dropdown-item>
                    <el-dropdown-item command="rendererSettings">渲染设置</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button size="small" @click.stop="showDetails(instance)">
                详情
              </el-button>
              <el-button size="small" @click.stop="addInstance">
                新增
              </el-button>
              <el-button size="small" @click.stop="takeSnapshot(instance)">
                快照
              </el-button>
              <el-button 
                size="small" 
                :type="instance.isRecording ? 'danger' : 'default'"
                @click.stop="toggleRecording(instance)"
              >
                {{ instance.isRecording ? `录制(${instance.recordingCountdown.toFixed(1)}s)` : '录制' }}
              </el-button>
              <el-button size="small" @click.stop="toggleFullscreen(instance)">
                {{ instance.isFullscreen ? '恢复' : '全屏' }}
              </el-button>
              <el-button size="small" 
                type="danger" 
                @click.stop="showDeleteConfirm(instance)" 
                :disabled="index === 0"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
        <div class="instance-canvas-container">
          <canvas 
            :ref="(el) => setCanvasRef(instance.id, el)" 
            class="spectrum-canvas"
            @mousedown="(e) => onMouseDown(e, instance)"
            @mousemove="(e) => onMouseMove(e, instance)"
            @mouseup="(e) => onMouseUp(e, instance)"
            @mouseleave="(e) => onMouseLeave(e, instance)"
            @wheel.prevent="(e) => onWheel(e, instance)"
          ></canvas>
          <div v-if="instance.hoverInfo" class="hover-info-box" 
            :style="{ left: instance.hoverPosition.x + 'px', top: instance.hoverPosition.y + 'px' }">
            <div class="info-row">
              <span class="info-label">天空频率</span>
              <span class="info-value">{{ instance.hoverInfo.skyFreq }}</span>
              <span class="info-unit">MHz</span>
            </div>
            <div class="info-row">
              <span class="info-label">接入频率</span>
              <span class="info-value">{{ instance.hoverInfo.accessFreq }}</span>
              <span class="info-unit">MHz</span>
            </div>
            <div class="info-row">
              <span class="info-label">电平</span>
              <span class="info-value">{{ instance.hoverInfo.level }}</span>
              <span class="info-unit">dBm</span>
            </div>
          </div>
          <div v-if="instance.boxInfo" class="box-info-box" 
            :style="{ left: instance.boxInfoPosition.x + 'px', top: instance.boxInfoPosition.y + 'px' }">
            <div class="info-row">
              <span class="info-label">天空中心频率</span>
              <span class="info-value">{{ instance.boxInfo.skyCenterFreq }}</span>
              <span class="info-unit">MHz</span>
            </div>
            <div class="info-row">
              <span class="info-label">接入中心频率</span>
              <span class="info-value">{{ instance.boxInfo.accessCenterFreq }}</span>
              <span class="info-unit">MHz</span>
            </div>
            <div class="info-row">
              <span class="info-label">带宽</span>
              <span class="info-value">{{ instance.boxInfo.bandwidth }}</span>
              <span class="info-unit">MHz</span>
            </div>
            <div class="info-row">
              <span class="info-label">电平</span>
              <span class="info-value">{{ instance.boxInfo.level }}</span>
              <span class="info-unit">dBm</span>
            </div>
          </div>
        </div>
        <div class="instance-footer">
          <div class="footer-item">
            <span>中心频率: {{ formatFreq(instance.config.centerFreq) }}</span>
          </div>
          <div class="footer-item">
            <span>带宽: {{ formatFreq(instance.config.span) }}</span>
          </div>
          <div class="footer-item">
            <span>峰值: {{ instance.stats.max.toFixed(2) }} dBm</span>
          </div>
        </div>

        <!-- 设置弹窗 -->
        <el-dialog 
          v-model="instance.settingsDialogVisible" 
          :title="instance.settingsDialogTitle" 
          width="420px"
          :append-to-body="true"
          destroy-on-close
        >
          <!-- 频率设置 -->
          <div v-if="instance.activeSettingsTab === 'freqSettings'" class="settings-form">
            <div class="form-item">
              <label>中心频率 (MHz)</label>
              <el-input-number v-model="instance.freqSettings.centerFreq" :min="1" :max="60000" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>起始频率 (MHz)</label>
              <el-input-number v-model="instance.freqSettings.startFreq" :min="1" :max="60000" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>终止频率 (MHz)</label>
              <el-input-number v-model="instance.freqSettings.endFreq" :min="1" :max="60000" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>频宽 (MHz)</label>
              <el-input-number v-model="instance.freqSettings.span" :min="1" :max="60000" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>RBW (kHz)</label>
              <el-input-number v-model="instance.freqSettings.rbw" :min="1" :max="10000" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>VBW (kHz)</label>
              <el-input-number v-model="instance.freqSettings.vbw" :min="1" :max="10000" :step="1" size="small" />
            </div>
          </div>
          <!-- 电平设置 -->
          <div v-if="instance.activeSettingsTab === 'levelSettings'" class="settings-form">
            <div class="form-item">
              <label>参考电平 (dBm)</label>
              <el-input-number v-model="instance.levelSettings.refLevel" :min="-130" :max="30" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>电平偏移 (dB)</label>
              <el-input-number v-model="instance.levelSettings.levelOffset" :min="-100" :max="100" :step="0.1" size="small" />
            </div>
            <div class="form-item">
              <label>衰减 (dB)</label>
              <el-input-number v-model="instance.levelSettings.attenuation" :min="0" :max="70" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>前置放大器</label>
              <el-switch v-model="instance.levelSettings.preAmpEnabled" size="small" />
            </div>
          </div>
          <!-- 显示设置 -->
          <div v-if="instance.activeSettingsTab === 'displaySettings'" class="settings-form">
            <div class="form-item">
              <label>显示线条</label>
              <el-select v-model="instance.displaySettings.lineStyle" size="small">
                <el-option label="实线" value="solid" />
                <el-option label="虚线" value="dashed" />
                <el-option label="点线" value="dotted" />
              </el-select>
            </div>
            <div class="form-item">
              <label>线条宽度</label>
              <el-input-number v-model="instance.displaySettings.lineWidth" :min="0.5" :max="5" :step="0.5" size="small" />
            </div>
            <div class="form-item">
              <label>填充区域</label>
              <el-switch v-model="instance.displaySettings.fillEnabled" size="small" />
            </div>
            <div class="form-item">
              <label>检测模式</label>
              <el-select v-model="instance.displaySettings.detectorMode" size="small">
                <el-option label="自动" value="auto" />
                <el-option label="正峰值" value="positive" />
                <el-option label="负峰值" value="negative" />
                <el-option label="采样" value="sample" />
              </el-select>
            </div>
            <div class="form-item">
              <label>平均次数</label>
              <el-input-number v-model="instance.displaySettings.avgCount" :min="1" :max="1000" :step="1" size="small" />
            </div>
          </div>
          <!-- 渲染设置 -->
          <div v-if="instance.activeSettingsTab === 'rendererSettings'" class="settings-form">
            <div class="form-item">
              <label>扫描时间 (ms)</label>
              <el-input-number v-model="instance.rendererSettings.sweepTime" :min="10" :max="10000" :step="10" size="small" />
            </div>
            <div class="form-item">
              <label>频率分辨率 (kHz)</label>
              <el-input-number v-model="instance.rendererSettings.freqResolution" :min="1" :max="10000" :step="1" size="small" />
            </div>
            <div class="form-item">
              <label>扫描模式</label>
              <el-select v-model="instance.rendererSettings.sweepMode" size="small">
                <el-option label="连续扫描" value="sweep" />
                <el-option label="单次扫描" value="single" />
                <el-option label="FFT" value="fft" />
              </el-select>
            </div>
            <div class="form-item">
              <label>增益 (dB)</label>
              <el-input-number v-model="instance.rendererSettings.gain" :min="0" :max="50" :step="1" size="small" />
            </div>
          </div>
          <template #footer>
            <el-button size="small" @click="instance.settingsDialogVisible = false">取消</el-button>
            <el-button size="small" type="primary" @click="applySettings(instance)">应用</el-button>
          </template>
        </el-dialog>

        <!-- 详情弹窗 -->
        <el-dialog 
          v-if="instance?.detailsDialogVisible"
          v-model="instance.detailsDialogVisible" 
          title="频谱详情" 
          width="480px"
          :append-to-body="true"
        >
          <div class="details-content">
            <div class="details-row">
              <span class="details-label">中心频率</span>
              <span class="details-value">{{ formatFreq(instance.config.centerFreq) }}</span>
            </div>
            <div class="details-row">
              <span class="details-label">带宽</span>
              <span class="details-value">{{ formatFreq(instance.config.span) }}</span>
            </div>
            <div class="details-row">
              <span class="details-label">起始频率</span>
              <span class="details-value">{{ formatFreq(instance.config.startFreq) }}</span>
            </div>
            <div class="details-row">
              <span class="details-label">终止频率</span>
              <span class="details-value">{{ formatFreq(instance.config.endFreq) }}</span>
            </div>
            <div class="details-row">
              <span class="details-label">参考电平</span>
              <span class="details-value">{{ instance.config.refLevel.toFixed(1) }} dBm</span>
            </div>
            <div class="details-row">
              <span class="details-label">当前峰值</span>
              <span class="details-value highlight">{{ instance.stats.max.toFixed(2) }} dBm</span>
            </div>
            <div class="details-row">
              <span class="details-label">当前谷值</span>
              <span class="details-value">{{ instance.stats.min.toFixed(2) }} dBm</span>
            </div>
            <div class="details-row">
              <span class="details-label">平均值</span>
              <span class="details-value">{{ instance.stats.avg.toFixed(2) }} dBm</span>
            </div>
            <div class="details-row">
              <span class="details-label">RBW</span>
              <span class="details-value">{{ (instance.config.rbw / 1000).toFixed(1) }} kHz</span>
            </div>
            <div class="details-row">
              <span class="details-label">VBW</span>
              <span class="details-value">{{ (instance.config.vbw / 1000).toFixed(1) }} kHz</span>
            </div>
            <div class="details-row">
              <span class="details-label">扫描时间</span>
              <span class="details-value">{{ instance.config.sweepTime }} ms</span>
            </div>
            <div class="details-row">
              <span class="details-label">瀑布图</span>
              <span class="details-value">{{ instance.config.waterfallEnabled ? '开启' : '关闭' }}</span>
            </div>
          </div>
          <template #footer>
            <el-button size="small" type="primary" @click="instance.detailsDialogVisible = false">关闭</el-button>
          </template>
        </el-dialog>
      </div>
      
      <el-dialog v-if="instance?.snapshotDialogVisible" v-model="instance.snapshotDialogVisible" title="快照预览" width="600px" class="snapshot-dialog">
        <div class="snapshot-preview">
          <img :src="instance.snapshotUrl" alt="快照预览" class="snapshot-image">
        </div>
        <template #footer>
          <el-button size="small" @click="instance.snapshotDialogVisible = false">关闭</el-button>
          <el-button size="small" type="primary" @click="downloadSnapshot(instance)">下载</el-button>
        </template>
      </el-dialog>
      
      <el-dialog v-if="instance?.deleteConfirmVisible" v-model="instance.deleteConfirmVisible" title="确认删除" width="350px" class="delete-confirm-dialog">
        <div class="delete-confirm-content">
          <p>确定要删除此频谱组件吗？</p>
          <p class="delete-warning">此操作无法撤销。</p>
        </div>
        <template #footer>
          <el-button size="small" @click="instance.deleteConfirmVisible = false">取消</el-button>
          <el-button size="small" type="danger" @click="confirmDelete(instance)">确认删除</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, markRaw } from 'vue';
import { ElMessage } from 'element-plus';
import { SpectrumCanvasRenderer } from '../renderers/SpectrumCanvasRenderer.js';
import { defaultSpectrumConfig, formatFreq, generateSpectrumData } from '../utils/spectrumUtils.js';

const instances = ref([]);
const activeInstanceId = ref(null);
let instanceIdCounter = 0;

const canvasRefs = {};
const instancesContainer = ref(null);

const getInstanceStyle = (instance, index) => {
  if (instance.isFullscreen) {
    return { height: '100%', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000 };
  }
  const count = instances.value.filter(i => !i.isFullscreen).length;
  if (count <= 1) {
    return { height: '100%' };
  }
  // 2个及以上：每个组件都是50%高度，超出视窗用滚动条
  return { height: '50%' };
};

const activeInstance = computed(() => {
  return instances.value.find(i => i.id === activeInstanceId.value);
});

const createInstanceData = (id) => {
  return {
    id,
    config: { ...defaultSpectrumConfig },
    isPlaying: true,
    isRecording: false,
    recordingCountdown: 10,
    isFullSample: true,
    isFullscreen: false,
    stats: { max: -100, min: -100, avg: -100, maxIndex: 0, minIndex: 0 },
    selectedPreset: '',
    hoverInfo: null,
    hoverPosition: { x: 0, y: 0 },
    isBoxSelecting: false,
    boxSelection: { startX: 0, startY: 0, endX: 0, endY: 0 },
    boxInfo: null,
    boxInfoPosition: { x: 0, y: 0 },
    renderer: null,
    canvas: null,
    dataTimer: null,
    recordingTimer: null,
    recordingInterval: null,
    animationId: null,
    recordedFrames: [],
    snapshotDialogVisible: false,
    snapshotUrl: '',
    deleteConfirmVisible: false,
    // 设置弹窗状态
    settingsDialogVisible: false,
    settingsDialogTitle: '',
    activeSettingsTab: '',
    // 频率设置
    freqSettings: {
      centerFreq: 1000,
      startFreq: 900,
      endFreq: 1100,
      span: 200,
      rbw: 1000,
      vbw: 1000
    },
    // 电平设置
    levelSettings: {
      refLevel: 0,
      levelOffset: 0,
      attenuation: 0,
      preAmpEnabled: false
    },
    // 显示设置
    displaySettings: {
      lineStyle: 'solid',
      lineWidth: 1.5,
      fillEnabled: false,
      detectorMode: 'auto',
      avgCount: 1
    },
    // 渲染设置
    rendererSettings: {
      sweepTime: 100,
      freqResolution: 1000,
      sweepMode: 'sweep',
      gain: 20
    },
    // 详情弹窗
    detailsDialogVisible: false
  };
};

const initInstanceRenderer = (instance, canvas) => {
  const rect = canvas?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    setTimeout(() => initInstanceRenderer(instance, canvas), 100);
    return;
  }
  // 瀑布图显示时占50%高度
  const waterfallHeight = instance.config.waterfallEnabled ? (rect.height * 0.5) : 0;
  instance.renderer = markRaw(new SpectrumCanvasRenderer(canvas, {
    waterfallHeight
  }));
  instance.renderer.setConfig({
    centerFreq: instance.config.centerFreq,
    span: instance.config.span,
    refLevel: instance.config.refLevel
  });
  startInstanceRenderLoop(instance);
};

const startInstanceRenderLoop = (instance) => {
  const render = () => {
    if (instance.renderer) instance.renderer.render();
    instance.animationId = requestAnimationFrame(render);
  };
  render();
};

const stopInstanceRenderLoop = (instance) => {
  if (instance.animationId) {
    cancelAnimationFrame(instance.animationId);
    instance.animationId = null;
  }
};

const startInstanceDataLoop = (instance) => {
  if (instance.dataTimer) clearInterval(instance.dataTimer);
  instance.dataTimer = setInterval(() => {
    generateInstanceData(instance);
  }, instance.config.sweepTime);
};

const stopInstanceDataLoop = (instance) => {
  if (instance.dataTimer) {
    clearInterval(instance.dataTimer);
    instance.dataTimer = null;
  }
};

const generateInstanceData = (instance) => {
  if (!instance.isPlaying) return;
  const points = Math.max(10, Math.floor(instance.config.span / instance.config.freqResolution));
  const minLevel = instance.config.refLevel - 100;
  const maxLevel = instance.config.refLevel;
  const data = generateSpectrumData(points, minLevel, maxLevel, instance.config.centerFreq, instance.config.span);
  
  let max = -Infinity, min = Infinity, sum = 0, maxIndex = 0, minIndex = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > max) { max = data[i]; maxIndex = i; }
    if (data[i] < min) { min = data[i]; minIndex = i; }
    sum += data[i];
  }
  instance.stats.max = max;
  instance.stats.min = min;
  instance.stats.avg = sum / data.length;
  instance.stats.maxIndex = maxIndex;
  instance.stats.minIndex = minIndex;
  
  if (instance.renderer) {
    instance.renderer.setData({ spectrum: data });
    if (instance.config.waterfallEnabled) {
      instance.renderer.addWaterfallLine(data);
    }
    // 录制时保存帧数据
    if (instance.isRecording) {
      instance.recordedFrames.push({
        timestamp: Date.now(),
        spectrum: Array.from(data),
        centerFreq: instance.config.centerFreq,
        span: instance.config.span,
        refLevel: instance.config.refLevel
      });
    }
  }
};

const toggleInstanceWaterfall = (instance) => {
  instance.config.waterfallEnabled = !instance.config.waterfallEnabled;
  if (instance.renderer) {
    const canvasRect = instance.canvas.getBoundingClientRect();
    const waterfallHeight = instance.config.waterfallEnabled ? (canvasRect.height * 0.5) : 0;
    instance.renderer.setConfig({ waterfallHeight });
    if (!instance.config.waterfallEnabled) {
      instance.renderer.clearWaterfall();
      instance.renderer.waterfallData = [];
    }
    instance.renderer.resize();
  }
};

const toggleInstanceMaxHold = (instance) => {
  instance.config.maxHold = !instance.config.maxHold;
  if (instance.renderer) {
    instance.renderer.setConfig({ maxHold: instance.config.maxHold });
  }
};

const toggleInstanceMinHold = (instance) => {
  instance.config.minHold = !instance.config.minHold;
  if (instance.renderer) {
    instance.renderer.setConfig({ minHold: instance.config.minHold });
  }
};

const toggleInstanceRecording = (instance) => {
  if (instance.isRecording) {
    // 停止录制
    instance.isRecording = false;
    if (instance.recordingTimer) {
      clearInterval(instance.recordingTimer);
      instance.recordingTimer = null;
    }
    if (instance.recordingInterval) {
      clearInterval(instance.recordingInterval);
      instance.recordingInterval = null;
    }
    instance.recordingCountdown = 10;
    // 导出录制文件
    exportRecording(instance);
    ElMessage.success('录制完成，文件已导出');
  } else {
    // 开始录制
    instance.isRecording = true;
    instance.recordingCountdown = 10.0;
    instance.recordedFrames = [];
    
    // 100ms精度的倒计时
    instance.recordingInterval = setInterval(() => {
      instance.recordingCountdown = Math.max(0, instance.recordingCountdown - 0.1);
      // 精确到小数点一位
      instance.recordingCountdown = Math.round(instance.recordingCountdown * 10) / 10;
      if (instance.recordingCountdown <= 0) {
        // 倒计时结束，自动停止录制
        if (instance.isRecording) {
          toggleInstanceRecording(instance);
        }
      }
    }, 100);
    
    ElMessage.success('开始录制');
  }
};

const exportRecording = (instance) => {
  if (!instance.recordedFrames || instance.recordedFrames.length === 0) {
    ElMessage.warning('没有录制数据');
    return;
  }
  
  const recordingData = {
    version: '1.0',
    exportTime: new Date().toISOString(),
    totalFrames: instance.recordedFrames.length,
    frames: instance.recordedFrames
  };
  
  const jsonStr = JSON.stringify(recordingData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `spectrum-recording-${Date.now()}.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  
  instance.recordedFrames = [];
};

const destroyInstance = (instance) => {
  stopInstanceDataLoop(instance);
  stopInstanceRenderLoop(instance);
  if (instance.recordingTimer) {
    clearInterval(instance.recordingTimer);
    instance.recordingTimer = null;
  }
  if (instance.recordingInterval) {
    clearInterval(instance.recordingInterval);
    instance.recordingInterval = null;
  }
  instance.renderer = null;
};

const setCanvasRef = (id, el) => {
  if (el) {
    canvasRefs[id] = el;
    const instance = instances.value.find(i => i.id === id);
    if (instance && !instance.renderer) {
      nextTick(() => {
        instance.canvas = el;
        initInstanceRenderer(instance, el);
        startInstanceDataLoop(instance);
      });
    }
  }
};

const createInstance = () => {
  instanceIdCounter++;
  const id = instanceIdCounter;
  const instance = reactive(createInstanceData(id));
  instances.value.push(instance);
  activeInstanceId.value = id;
  return instance;
};

const addInstance = () => {
  createInstance();
  nextTick(() => {
    handleResize();
  });
  ElMessage.success('已添加频谱组件');
};

const removeInstance = (id) => {
  const index = instances.value.findIndex(i => i.id === id);
  if (index === 0) {
    ElMessage.warning('第一个频谱组件不允许删除');
    return;
  }
  const instance = instances.value[index];
  destroyInstance(instance);
  instances.value.splice(index, 1);
  if (activeInstanceId.value === id) {
    activeInstanceId.value = instances.value[0]?.id;
  }
  nextTick(() => {
    handleResize();
  });
  ElMessage.success('已删除频谱组件');
};

const setActiveInstance = (id) => {
  activeInstanceId.value = id;
};

const toggleWaterfall = (instance) => {
  toggleInstanceWaterfall(instance);
};

const toggleMaxHold = (instance) => {
  toggleInstanceMaxHold(instance);
};

const toggleMinHold = (instance) => {
  toggleInstanceMinHold(instance);
};

const toggleSampleMode = (instance) => {
  instance.isFullSample = !instance.isFullSample;
  ElMessage.info(instance.isFullSample ? '已切换为全样模式' : '已切换为抽样模式');
};

const handleSettingsCommand = (command, instance) => {
  instance.activeSettingsTab = command;
  switch (command) {
    case 'freqSettings':
      instance.settingsDialogTitle = '频率设置';
      // 同步当前值到设置表单
      instance.freqSettings.centerFreq = instance.config.centerFreq / 1e6;
      instance.freqSettings.startFreq = instance.config.startFreq / 1e6;
      instance.freqSettings.endFreq = instance.config.endFreq / 1e6;
      instance.freqSettings.span = instance.config.span / 1e6;
      instance.freqSettings.rbw = instance.config.rbw / 1e3;
      instance.freqSettings.vbw = instance.config.vbw / 1e3;
      break;
    case 'levelSettings':
      instance.settingsDialogTitle = '电平设置';
      instance.levelSettings.refLevel = instance.config.refLevel;
      break;
    case 'displaySettings':
      instance.settingsDialogTitle = '显示设置';
      break;
    case 'rendererSettings':
      instance.settingsDialogTitle = '渲染设置';
      instance.rendererSettings.sweepTime = instance.config.sweepTime;
      instance.rendererSettings.freqResolution = instance.config.freqResolution / 1e3;
      instance.rendererSettings.sweepMode = instance.config.sweepMode;
      instance.rendererSettings.gain = instance.config.gain;
      break;
  }
  instance.settingsDialogVisible = true;
};

const applySettings = (instance) => {
  switch (instance.activeSettingsTab) {
    case 'freqSettings': {
      instance.config.centerFreq = instance.freqSettings.centerFreq * 1e6;
      instance.config.startFreq = instance.freqSettings.startFreq * 1e6;
      instance.config.endFreq = instance.freqSettings.endFreq * 1e6;
      instance.config.span = instance.freqSettings.span * 1e6;
      instance.config.rbw = instance.freqSettings.rbw * 1e3;
      instance.config.vbw = instance.freqSettings.vbw * 1e3;
      if (instance.renderer) {
        instance.renderer.setConfig({
          centerFreq: instance.config.centerFreq,
          span: instance.config.span
        });
        instance.renderer.resetZoom();
      }
      break;
    }
    case 'levelSettings': {
      instance.config.refLevel = instance.levelSettings.refLevel;
      if (instance.renderer) {
        instance.renderer.setConfig({
          refLevel: instance.config.refLevel
        });
        instance.renderer.resetZoom();
      }
      break;
    }
    case 'displaySettings': {
      if (instance.renderer) {
        instance.renderer.setConfig({
          lineStyle: instance.displaySettings.lineStyle,
          lineWidth: instance.displaySettings.lineWidth,
          fillEnabled: instance.displaySettings.fillEnabled
        });
      }
      break;
    }
    case 'rendererSettings': {
      instance.config.sweepTime = instance.rendererSettings.sweepTime;
      instance.config.freqResolution = instance.rendererSettings.freqResolution * 1e3;
      instance.config.sweepMode = instance.rendererSettings.sweepMode;
      instance.config.gain = instance.rendererSettings.gain;
      // 重启数据循环以应用新的扫描时间
      stopInstanceDataLoop(instance);
      startInstanceDataLoop(instance);
      break;
    }
  }
  instance.settingsDialogVisible = false;
  ElMessage.success('设置已应用');
};

const showDetails = (instance) => {
  instance.detailsDialogVisible = true;
};

const takeSnapshot = (instance) => {
  if (instance.renderer) {
    const url = instance.renderer.takeSnapshot();
    instance.snapshotUrl = url;
    instance.snapshotDialogVisible = true;
  }
};

const downloadSnapshot = (instance) => {
  const link = document.createElement('a');
  link.download = `spectrum-${Date.now()}.png`;
  link.href = instance.snapshotUrl;
  link.click();
  ElMessage.success('快照已保存');
};

const showDeleteConfirm = (instance) => {
  instance.deleteConfirmVisible = true;
};

const confirmDelete = (instance) => {
  instance.deleteConfirmVisible = false;
  const index = instances.value.findIndex(i => i.id === instance.id);
  if (index === 0) {
    ElMessage.warning('第一个频谱组件不允许删除');
    return;
  }
  destroyInstance(instance);
  instances.value.splice(index, 1);
  if (activeInstanceId.value === instance.id) {
    activeInstanceId.value = instances.value[0]?.id;
  }
  nextTick(() => {
    handleResize();
  });
  ElMessage.success('已删除频谱组件');
};

const toggleFullscreen = (instance) => {
  instance.isFullscreen = !instance.isFullscreen;
  nextTick(() => {
    handleResize();
  });
};

const toggleRecording = (instance) => {
  toggleInstanceRecording(instance);
};

const onMouseDown = (e, instance) => {
  if (e.button === 0 && instance.renderer) {
    const rect = instance.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (instance.renderer.isInPlotArea(x, y)) {
      instance.isBoxSelecting = true;
      instance.boxSelection.startX = x;
      instance.boxSelection.startY = y;
      instance.boxSelection.endX = x;
      instance.boxSelection.endY = y;
      instance.renderer.setBoxSelection({ ...instance.boxSelection });
      instance.hoverInfo = null;
    }
  }
};

const onMouseMove = (e, instance) => {
  const rect = instance.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  if (instance.isBoxSelecting) {
    instance.boxSelection.endX = x;
    instance.boxSelection.endY = y;
    instance.renderer.setBoxSelection({ ...instance.boxSelection });
    instance.renderer.setMousePosition(null);
  }
  
  if (!instance.isBoxSelecting && instance.renderer && instance.renderer.isInPlotArea(x, y)) {
    instance.renderer.setMousePosition({ x, y });
    
    const freq = instance.renderer.getFreqAtX(x);
    const level = instance.renderer.getLevelAtY(y);
    
    const skyFreq = (freq / 1e6).toFixed(3);
    const accessFreq = ((freq - 10700000) / 1e6).toFixed(3);
    const lvl = level !== null ? level.toFixed(2) : '-';
    
    instance.hoverInfo = { skyFreq, accessFreq, level: lvl };
    instance.hoverPosition.x = e.clientX + 15;
    instance.hoverPosition.y = e.clientY - 10;
  } else if (!instance.isBoxSelecting) {
    instance.renderer?.setMousePosition(null);
    instance.hoverInfo = null;
  }
  
  if (instance.renderer?.boxSelection) {
    const selection = instance.renderer.boxSelection;
    const selX = Math.min(selection.startX, selection.endX);
    const selWidth = Math.abs(selection.endX - selection.startX);
    if (x >= selX && x <= selX + selWidth) {
      const startFreq = instance.renderer.getFreqAtX(selX);
      const endFreq = instance.renderer.getFreqAtX(selX + selWidth);
      const centerFreq = (startFreq + endFreq) / 2;
      const bandwidth = endFreq - startFreq;
      
      const skyCenterFreq = (centerFreq / 1e6).toFixed(3);
      const accessCenterFreq = ((centerFreq - 10700000) / 1e6).toFixed(3);
      const bw = (bandwidth / 1e6).toFixed(3);
      
      const points = instance.renderer.spectrumData?.length || 1;
      const startIndex = Math.round(((selX - instance.renderer.plotArea.x) / instance.renderer.plotArea.width) * (points - 1));
      const endIndex = Math.round((((selX + selWidth) - instance.renderer.plotArea.x) / instance.renderer.plotArea.width) * (points - 1));
      const clampedStart = Math.max(0, startIndex);
      const clampedEnd = Math.min(points - 1, endIndex);
      
      let avgLevel = 0;
      let count = 0;
      for (let i = clampedStart; i <= clampedEnd; i++) {
        avgLevel += instance.renderer.spectrumData[i];
        count++;
      }
      const avgDbm = count > 0 ? (avgLevel / count).toFixed(2) : '-';
      
      instance.boxInfo = {
        skyCenterFreq,
        accessCenterFreq,
        bandwidth: bw,
        level: avgDbm
      };
      instance.boxInfoPosition.x = e.clientX + 15;
      instance.boxInfoPosition.y = e.clientY - 10;
    } else {
      instance.boxInfo = null;
    }
  }
};

const onMouseUp = (e, instance) => {
  if (instance.isBoxSelecting) {
    instance.isBoxSelecting = false;
    const width = Math.abs(instance.boxSelection.endX - instance.boxSelection.startX);
    if (width < 5) {
      if (instance.renderer) {
        instance.renderer.setBoxSelection(null);
      }
    }
  }
};

const onMouseLeave = (e, instance) => {
  instance.isBoxSelecting = false;
  instance.hoverInfo = null;
  if (instance.renderer) {
    instance.renderer.setBoxSelection(null);
  }
};

const onWheel = (e, instance) => {
  const rect = instance.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (instance.renderer && instance.renderer.isInPlotArea(x, y)) {
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    instance.renderer.zoomAt(x, y, factor, factor);
  }
};

const handleResize = () => {
  instances.value.forEach(instance => {
    if (instance.renderer) {
      // 重新计算瀑布图高度
      const canvasRect = instance.canvas?.getBoundingClientRect();
      if (canvasRect && instance.config.waterfallEnabled) {
        const newWaterfallHeight = canvasRect.height * 0.5;
        instance.renderer.setConfig({ waterfallHeight: newWaterfallHeight });
      }
      instance.renderer.resize();
    }
  });
};

onMounted(() => {
  createInstance();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  instances.value.forEach(instance => destroyInstance(instance));
});
</script>

<style scoped>
.spectrum-container {
  width: 100%;
  height: 100%;
  background: #0a1628;
  overflow: hidden;
}

.spectrum-instances {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  position: relative;
}

.spectrum-instance {
  display: flex;
  flex-direction: column;
  border: 1px solid #1e4976;
  background: #0a1628;
  overflow: hidden;
  box-sizing: border-box;
  flex-shrink: 0;
}

.spectrum-instance.active {
  border-color: #3a6b9c;
}

.spectrum-instance.fullscreen {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100% !important;
  z-index: 1000;
}

.instance-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: linear-gradient(180deg, #153a5c 0%, #0f2a44 100%);
  border-bottom: 1px solid #1e4976;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.toolbar-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
}

.instance-canvas-container {
  flex: 1;
  position: relative;
  background: #000;
  overflow: hidden;
  min-height: 0;
}

.spectrum-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}

.hover-info-box {
  position: fixed;
  background: rgba(10, 30, 60, 0.95);
  border: 1px solid #3a8fd4;
  border-radius: 4px;
  padding: 12px 16px;
  min-width: 220px;
  z-index: 1000;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.box-info-box {
  position: fixed;
  background: rgba(10, 30, 60, 0.95);
  border: 1px solid #3a8fd4;
  border-radius: 4px;
  padding: 12px 16px;
  min-width: 280px;
  z-index: 1000;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.snapshot-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: #0a1628;
}

.snapshot-image {
  max-width: 100%;
  max-height: 400px;
  border: 1px solid #1e4976;
  border-radius: 4px;
}

.delete-confirm-content {
  padding: 20px;
  text-align: center;
}

.delete-confirm-content p {
  color: #c0c4cc;
  font-size: 14px;
  margin-bottom: 10px;
}

.delete-warning {
  color: #d9363e !important;
  font-size: 13px !important;
}

.info-row {
  display: flex;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(58, 143, 212, 0.2);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  flex: 1;
  color: #8ab4d8;
  font-size: 14px;
}

.info-value {
  color: #fff;
  font-size: 16px;
  font-family: 'Courier New', monospace;
  font-weight: 500;
  margin-right: 8px;
}

.info-unit {
  color: #8ab4d8;
  font-size: 13px;
  width: 40px;
  text-align: right;
}

.instance-footer {
  display: flex;
  gap: 30px;
  padding: 6px 16px;
  background: #0f2a44;
  border-top: 1px solid #1e4976;
  font-size: 12px;
  color: #66b2ff;
  flex-shrink: 0;
}

.footer-item {
  color: #8ab4d8;
}

/* 设置表单样式 */
.settings-form {
  padding: 0;
}

.form-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(58, 143, 212, 0.12);
}

.form-item:last-child {
  border-bottom: none;
}

.form-item label {
  color: #66b2ff;
  font-size: 13px;
  min-width: 120px;
  font-weight: 500;
}

/* 详情弹窗样式 */
.details-content {
  padding: 0;
}

.details-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(58, 143, 212, 0.12);
}

.details-row:last-child {
  border-bottom: none;
}

.details-label {
  color: #66b2ff;
  font-size: 13px;
}

.details-value {
  color: #ffffff;
  font-size: 14px;
  font-family: 'Courier New', monospace;
}

.details-value.highlight {
  color: #00ff88;
  font-weight: bold;
}

:deep(.el-button) {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 3px;
}

:deep(.el-button--small) {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 3px;
}

:deep(.el-button--primary) {
  background: linear-gradient(180deg, #2d7dd2 0%, #1a5fa0 100%);
  border-color: #3a8fd4;
  border-radius: 3px;
}

:deep(.el-button--primary:hover) {
  background: linear-gradient(180deg, #3a8fd4 0%, #2d7dd2 100%);
  border-color: #4da6e8;
}

:deep(.el-button--danger) {
  background: linear-gradient(180deg, #d9363e 0%, #b92b33 100%);
  border-color: #dc484f;
  border-radius: 3px;
}

:deep(.el-button--danger:hover) {
  background: linear-gradient(180deg, #e6454c 0%, #d9363e 100%);
  border-color: #e85a61;
}

:deep(.el-select) {
  --el-select-font-size: 12px;
}

:deep(.el-dropdown) {
  display: inline-block;
}

:deep(.el-dialog) {
  background: linear-gradient(180deg, #0d1f35 0%, #0a1628 100%);
  border: 1px solid #1e4976;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #1e4976;
  padding: 16px 24px;
  background: linear-gradient(180deg, #153a5c 0%, #0f2a44 100%);
  border-radius: 8px 8px 0 0;
}

:deep(.el-dialog__title) {
  color: #8ab4d8;
  font-size: 16px;
  font-weight: 600;
}

:deep(.el-dialog__body) {
  padding: 0;
  color: #c0c4cc;
  background: #0a1628;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid #1e4976;
  padding: 14px 24px;
  background: #0f2a44;
  border-radius: 0 0 8px 8px;
}

:deep(.el-input-number) {
  width: 130px;
}

:deep(.el-input-number__decrease),
:deep(.el-input-number__increase) {
  background: #153a5c;
  border-color: #1e4976;
  color: #66b2ff;
  border-radius: 0;
}

:deep(.el-input-number__decrease:hover),
:deep(.el-input-number__increase:hover) {
  background: #1e4976;
  color: #fff;
}

:deep(.el-input-number__input) {
  background: #0f2a44;
  border-color: #1e4976;
  color: #fff;
}

:deep(.el-select) {
  width: 130px;
}

:deep(.el-select .el-input__inner) {
  background: #0f2a44;
  border-color: #1e4976;
  color: #fff;
}

:deep(.el-select-dropdown) {
  background: #0f2a44;
  border-color: #1e4976;
}

:deep(.el-select-dropdown__item) {
  color: #66b2ff;
}

:deep(.el-select-dropdown__item.selected) {
  color: #8ab4d8;
  background: rgba(58, 143, 212, 0.2);
}

:deep(.el-switch__core) {
  background: #1e4976;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background: #2d7dd2;
}

:deep(.el-form-item__label) {
  color: #66b2ff;
}

:deep(.el-dialog__close) {
  color: #66b2ff;
}

:deep(.el-dialog__close:hover) {
  color: #8ab4d8;
}
</style>
