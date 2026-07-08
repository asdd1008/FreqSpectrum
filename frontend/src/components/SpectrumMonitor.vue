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
                class="toolbar-btn"
                size="small"
                :type="instance.config.waterfallEnabled ? 'primary' : 'default'"
                @click.stop="toggleWaterfall(instance)"
              >
                瀑布图
              </el-button>
              <el-button
                class="toolbar-btn"
                size="small"
                :type="instance.config.maxHold ? 'primary' : 'default'"
                @click.stop="toggleMaxHold(instance)"
              >
                高点
              </el-button>
              <el-button
                class="toolbar-btn"
                size="small"
                :type="instance.config.minHold ? 'primary' : 'default'"
                @click.stop="toggleMinHold(instance)"
              >
                低点
              </el-button>
              <el-button
                class="toolbar-btn"
                size="small"
                :type="instance.isFullSample ? 'primary' : 'default'"
                @click.stop="toggleSampleMode(instance)"
              >
                全样
              </el-button>
              <el-button
                class="toolbar-btn"
                size="small"
                :type="!instance.isFullSample ? 'primary' : 'default'"
                @click.stop="toggleSampleMode(instance)"
              >
                抽样
              </el-button>
              <el-dropdown @command="(cmd) => handleSettingsCommand(cmd, instance)">
                <el-button class="toolbar-btn" size="small">
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
              <el-button class="toolbar-btn" size="small" @click.stop="showDetails(instance)">
                详情
              </el-button>
              <el-button class="toolbar-btn" size="small" @click.stop="addInstance">
                新增
              </el-button>
              <el-button class="toolbar-btn" size="small" @click.stop="takeSnapshot(instance)">
                快照
              </el-button>
              <el-button
                class="toolbar-btn"
                size="small"
                :type="instance.isRecording ? 'danger' : 'default'"
                @click.stop="toggleRecording(instance)"
              >
                {{ instance.isRecording ? `录制(${instance.recordingCountdown.toFixed(1)}s)` : '录制' }}
              </el-button>
              <el-button class="toolbar-btn" size="small" @click.stop="toggleFullscreen(instance)">
                {{ instance.isFullscreen ? '恢复' : '全屏' }}
              </el-button>
              <el-button class="toolbar-btn" size="small"
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
          width="480px"
          :append-to-body="true"
          destroy-on-close
          class="spectrum-settings-dialog"
        >
          <!-- 频率设置 -->
          <div v-if="instance.activeSettingsTab === 'freqSettings'" class="settings-panel">
            <div class="settings-section">
              <div class="section-title">频率参数</div>
              <div class="form-grid">
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x2699;</span>
                    中心频率
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.freqSettings.centerFreq" :min="1" :max="60000" :step="1" size="small" controls-position="right" />
                    <span class="unit">MHz</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x2194;</span>
                    起始频率
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.freqSettings.startFreq" :min="1" :max="60000" :step="1" size="small" controls-position="right" />
                    <span class="unit">MHz</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x2194;</span>
                    终止频率
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.freqSettings.endFreq" :min="1" :max="60000" :step="1" size="small" controls-position="right" />
                    <span class="unit">MHz</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x25A1;</span>
                    频宽
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.freqSettings.span" :min="1" :max="60000" :step="1" size="small" controls-position="right" />
                    <span class="unit">MHz</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-section">
              <div class="section-title">分辨率带宽</div>
              <div class="form-grid">
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x26A1;</span>
                    RBW
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.freqSettings.rbw" :min="1" :max="10000" :step="1" size="small" controls-position="right" />
                    <span class="unit">kHz</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x26A1;</span>
                    VBW
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.freqSettings.vbw" :min="1" :max="10000" :step="1" size="small" controls-position="right" />
                    <span class="unit">kHz</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 电平设置 -->
          <div v-if="instance.activeSettingsTab === 'levelSettings'" class="settings-panel">
            <div class="settings-section">
              <div class="section-title">电平参数</div>
              <div class="form-grid">
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x25B2;</span>
                    参考电平
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.levelSettings.refLevel" :min="-130" :max="30" :step="1" size="small" controls-position="right" />
                    <span class="unit">dBm</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x21C5;</span>
                    电平偏移
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.levelSettings.levelOffset" :min="-100" :max="100" :step="0.1" size="small" controls-position="right" />
                    <span class="unit">dB</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x26A0;</span>
                    衰减
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.levelSettings.attenuation" :min="0" :max="70" :step="1" size="small" controls-position="right" />
                    <span class="unit">dB</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x1F50A;</span>
                    前置放大器
                  </label>
                  <div class="form-control">
                    <el-switch
                      v-model="instance.levelSettings.preAmpEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 显示设置 -->
          <div v-if="instance.activeSettingsTab === 'displaySettings'" class="settings-panel">
            <div class="settings-section">
              <div class="section-title">显示参数</div>
              <div class="form-grid">
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x2500;</span>
                    显示线条
                  </label>
                  <div class="form-control">
                    <el-select v-model="instance.displaySettings.lineStyle" size="small">
                      <el-option label="实线" value="solid" />
                      <el-option label="虚线" value="dashed" />
                      <el-option label="点线" value="dotted" />
                    </el-select>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x25CB;</span>
                    线条宽度
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.displaySettings.lineWidth" :min="0.5" :max="5" :step="0.5" size="small" controls-position="right" />
                    <span class="unit">px</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x25A0;</span>
                    填充区域
                  </label>
                  <div class="form-control">
                    <el-switch
                      v-model="instance.displaySettings.fillEnabled"
                      active-text="开启"
                      inactive-text="关闭"
                    />
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x26A1;</span>
                    检测模式
                  </label>
                  <div class="form-control">
                    <el-select v-model="instance.displaySettings.detectorMode" size="small">
                      <el-option label="自动" value="auto" />
                      <el-option label="正峰值" value="positive" />
                      <el-option label="负峰值" value="negative" />
                      <el-option label="采样" value="sample" />
                    </el-select>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x2211;</span>
                    平均次数
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.displaySettings.avgCount" :min="1" :max="1000" :step="1" size="small" controls-position="right" />
                    <span class="unit">次</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 渲染设置 -->
          <div v-if="instance.activeSettingsTab === 'rendererSettings'" class="settings-panel">
            <div class="settings-section">
              <div class="section-title">渲染参数</div>
              <div class="form-grid">
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x23F1;</span>
                    扫描时间
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.rendererSettings.sweepTime" :min="10" :max="10000" :step="10" size="small" controls-position="right" />
                    <span class="unit">ms</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x2699;</span>
                    频率分辨率
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.rendererSettings.freqResolution" :min="1" :max="10000" :step="1" size="small" controls-position="right" />
                    <span class="unit">kHz</span>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x1F504;</span>
                    扫描模式
                  </label>
                  <div class="form-control">
                    <el-select v-model="instance.rendererSettings.sweepMode" size="small">
                      <el-option label="连续扫描" value="sweep" />
                      <el-option label="单次扫描" value="single" />
                      <el-option label="FFT" value="fft" />
                    </el-select>
                  </div>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x25B2;</span>
                    增益
                  </label>
                  <div class="form-control">
                    <el-input-number v-model="instance.rendererSettings.gain" :min="0" :max="50" :step="1" size="small" controls-position="right" />
                    <span class="unit">dB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <div class="dialog-footer">
              <el-button size="small" @click="instance.settingsDialogVisible = false">取消</el-button>
              <el-button size="small" type="primary" @click="applySettings(instance)">应用设置</el-button>
            </div>
          </template>
        </el-dialog>

        <!-- 详情弹窗 -->
        <el-dialog
          v-model="instance.detailsDialogVisible"
          title="频谱详情"
          width="520px"
          :append-to-body="true"
          class="spectrum-details-dialog"
        >
          <div class="details-panel-scroll">
            <div class="details-panel">
              <div class="details-section">
                <div class="section-title">
                  <span class="section-icon">&#x2699;</span>
                  频率信息
                </div>
                <div class="details-grid">
                  <div class="detail-card">
                    <div class="detail-label">中心频率</div>
                    <div class="detail-value">{{ formatFreq(instance.config.centerFreq) }}</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">带宽</div>
                    <div class="detail-value">{{ formatFreq(instance.config.span) }}</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">起始频率</div>
                    <div class="detail-value">{{ formatFreq(instance.config.startFreq) }}</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">终止频率</div>
                    <div class="detail-value">{{ formatFreq(instance.config.endFreq) }}</div>
                  </div>
                </div>
              </div>
              <div class="details-divider"></div>
              <div class="details-section">
                <div class="section-title">
                  <span class="section-icon">&#x25B2;</span>
                  电平信息
                </div>
                <div class="details-grid">
                  <div class="detail-card">
                    <div class="detail-label">参考电平</div>
                    <div class="detail-value">{{ instance.config.refLevel.toFixed(1) }} dBm</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">当前峰值</div>
                    <div class="detail-value highlight">{{ instance.stats.max.toFixed(2) }} dBm</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">当前谷值</div>
                    <div class="detail-value">{{ instance.stats.min.toFixed(2) }} dBm</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">平均值</div>
                    <div class="detail-value">{{ instance.stats.avg.toFixed(2) }} dBm</div>
                  </div>
                </div>
              </div>
              <div class="details-divider"></div>
              <div class="details-section">
                <div class="section-title">
                  <span class="section-icon">&#x26A1;</span>
                  参数设置
                </div>
                <div class="details-grid">
                  <div class="detail-card">
                    <div class="detail-label">RBW</div>
                    <div class="detail-value">{{ (instance.config.rbw / 1000).toFixed(1) }} kHz</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">VBW</div>
                    <div class="detail-value">{{ (instance.config.vbw / 1000).toFixed(1) }} kHz</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">扫描时间</div>
                    <div class="detail-value">{{ instance.config.sweepTime }} ms</div>
                  </div>
                  <div class="detail-card">
                    <div class="detail-label">瀑布图</div>
                    <div class="detail-value" :class="{ 'status-on': instance.config.waterfallEnabled, 'status-off': !instance.config.waterfallEnabled }">
                      {{ instance.config.waterfallEnabled ? '开启' : '关闭' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <template #footer>
            <div class="dialog-footer">
              <el-button size="small" type="primary" @click="instance.detailsDialogVisible = false">关闭</el-button>
            </div>
          </template>
        </el-dialog>
        <!-- 快照预览弹窗 -->
        <el-dialog
          v-model="instance.snapshotDialogVisible"
          title="快照预览"
          width="640px"
          :append-to-body="true"
          class="spectrum-snapshot-dialog"
        >
          <div class="snapshot-panel">
            <div class="snapshot-image-wrapper">
              <img :src="instance.snapshotUrl" alt="快照预览" class="snapshot-image">
            </div>
            <div class="snapshot-info">
              <span class="snapshot-time">{{ new Date().toLocaleString() }}</span>
            </div>
          </div>
          <template #footer>
            <div class="dialog-footer">
              <el-button size="small" @click="instance.snapshotDialogVisible = false">关闭</el-button>
              <el-button size="small" type="primary" @click="downloadSnapshot(instance)">
                <span class="btn-icon">&#x2B07;</span> 下载快照
              </el-button>
            </div>
          </template>
        </el-dialog>

        <!-- 删除确认弹窗 -->
        <el-dialog
          v-model="instance.deleteConfirmVisible"
          title="确认删除"
          width="400px"
          :append-to-body="true"
          class="spectrum-delete-dialog"
        >
          <div class="delete-panel">
            <div class="delete-icon">&#x26A0;</div>
            <div class="delete-message">
              <p class="delete-title">确定要删除此频谱组件吗？</p>
              <p class="delete-warning">删除后该组件的所有数据将被清除，此操作无法撤销。</p>
            </div>
          </div>
          <template #footer>
            <div class="dialog-footer">
              <el-button size="small" @click="instance.deleteConfirmVisible = false">取消</el-button>
              <el-button size="small" type="danger" @click="confirmDelete(instance)">确认删除</el-button>
            </div>
          </template>
        </el-dialog>
      </div>
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
    return {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 9999
    };
  }
  const count = instances.value.length;
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
  if (instances.value.length >= 6) {
    ElMessage.warning('最多只能添加6个频谱组件');
    return;
  }
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
  // 如果要进入全屏，先取消其他组件的全屏状态
  if (!instance.isFullscreen) {
    instances.value.forEach(i => {
      if (i.id !== instance.id && i.isFullscreen) {
        i.isFullscreen = false;
      }
    });
  }
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
  position: fixed !important;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
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

/* ============================================
   统一弹窗样式 - 暗色科技风格
   ============================================ */

/* 弹窗公共样式 */
:deep(.el-dialog) {
  background: linear-gradient(180deg, #0d1f35 0%, #0a1628 100%);
  border: 1px solid #1e4976;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid rgba(30, 73, 118, 0.6);
  padding: 18px 24px;
  background: linear-gradient(180deg, #153a5c 0%, #0f2a44 100%);
  margin-right: 0;
}

:deep(.el-dialog__title) {
  color: #8ab4d8;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

:deep(.el-dialog__body) {
  padding: 0;
  color: #c0c4cc;
  background: #0a1628;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid rgba(30, 73, 118, 0.6);
  padding: 16px 24px;
  background: linear-gradient(180deg, #0f2a44 0%, #0d1f35 100%);
}

:deep(.el-dialog__headerbtn) {
  top: 18px;
  right: 20px;
}

:deep(.el-dialog__close) {
  color: #66b2ff;
  font-size: 18px;
}

:deep(.el-dialog__close:hover) {
  color: #8ab4d8;
}

:deep(.el-overlay) {
  background-color: rgba(0, 10, 30, 0.75);
}

/* 对话框底部按钮区 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-icon {
  margin-right: 4px;
}

/* ============================================
   设置弹窗样式
   ============================================ */
.settings-panel {
  padding: 20px 24px;
}

.settings-section {
  margin-bottom: 16px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.section-title {
  color: #66b2ff;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid #3a8fd4;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-icon {
  font-size: 14px;
  opacity: 0.8;
}

.settings-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(58, 143, 212, 0.3) 50%, transparent 100%);
  margin: 16px 0;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(15, 42, 68, 0.5);
  border: 1px solid rgba(30, 73, 118, 0.3);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.form-row:hover {
  background: rgba(15, 42, 68, 0.8);
  border-color: rgba(58, 143, 212, 0.4);
}

.form-label {
  color: #8ab4d8;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.label-icon {
  font-size: 14px;
  opacity: 0.7;
}

.form-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.unit {
  color: #5a7a9a;
  font-size: 12px;
  min-width: 36px;
  text-align: left;
}

/* ============================================
   详情弹窗样式 - 卡片式布局
   ============================================ */
.details-panel {
  padding: 20px 24px;
}

.details-section {
  margin-bottom: 16px;
}

.details-section:last-child {
  margin-bottom: 0;
}

.details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.detail-card {
  background: rgba(15, 42, 68, 0.5);
  border: 1px solid rgba(30, 73, 118, 0.3);
  border-radius: 8px;
  padding: 14px 16px;
  transition: all 0.2s ease;
}

.detail-card:hover {
  background: rgba(15, 42, 68, 0.8);
  border-color: rgba(58, 143, 212, 0.4);
  transform: translateY(-1px);
}

.detail-label {
  color: #5a7a9a;
  font-size: 12px;
  margin-bottom: 6px;
  letter-spacing: 0.3px;
}

.detail-value {
  color: #ffffff;
  font-size: 15px;
  font-family: 'Courier New', monospace;
  font-weight: 500;
}

.detail-value.highlight {
  color: #00ff88;
  font-weight: 600;
}

.detail-value.status-on {
  color: #00ff88;
}

.detail-value.status-off {
  color: #ff6b6b;
}

.details-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(58, 143, 212, 0.3) 50%, transparent 100%);
  margin: 16px 0;
}

/* ============================================
   快照弹窗样式
   ============================================ */
.snapshot-panel {
  padding: 20px 24px;
}

.snapshot-image-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(30, 73, 118, 0.4);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.snapshot-image {
  max-width: 100%;
  max-height: 380px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.snapshot-info {
  text-align: center;
  color: #5a7a9a;
  font-size: 12px;
}

.snapshot-time {
  font-family: 'Courier New', monospace;
}

/* ============================================
   删除确认弹窗样式
   ============================================ */
.delete-panel {
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.delete-icon {
  font-size: 48px;
  color: #d9363e;
  opacity: 0.8;
}

.delete-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.delete-title {
  color: #c0c4cc;
  font-size: 15px;
  font-weight: 500;
  margin: 0;
}

.delete-warning {
  color: #d9363e;
  font-size: 13px;
  margin: 0;
  opacity: 0.8;
}

/* ============================================
   Element Plus 组件覆盖样式
   ============================================ */

:deep(.el-button) {
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

:deep(.el-button--small) {
  padding: 5px 14px;
  font-size: 12px;
  border-radius: 4px;
}

:deep(.el-button--primary) {
  background: linear-gradient(180deg, #2d7dd2 0%, #1a5fa0 100%);
  border-color: #3a8fd4;
}

:deep(.el-button--primary:hover) {
  background: linear-gradient(180deg, #3a8fd4 0%, #2d7dd2 100%);
  border-color: #4da6e8;
  box-shadow: 0 2px 8px rgba(45, 125, 210, 0.3);
}

:deep(.el-button--danger) {
  background: linear-gradient(180deg, #d9363e 0%, #b92b33 100%);
  border-color: #dc484f;
}

:deep(.el-button--danger:hover) {
  background: linear-gradient(180deg, #e6454c 0%, #d9363e 100%);
  border-color: #e85a61;
  box-shadow: 0 2px 8px rgba(217, 54, 62, 0.3);
}

:deep(.el-button--default) {
  background: rgba(15, 42, 68, 0.6);
  border-color: #1e4976;
  color: #8ab4d8;
}

:deep(.el-button--default:hover) {
  background: rgba(15, 42, 68, 0.9);
  border-color: #3a8fd4;
  color: #8ab4d8;
}

/* Input Number */
:deep(.el-input-number) {
  width: 120px;
}

:deep(.el-input-number .el-input__wrapper) {
  background: #0a1628;
  border: 1px solid #1e4976;
  box-shadow: none;
  border-radius: 4px;
  padding: 0 8px;
}

:deep(.el-input-number .el-input__wrapper:hover) {
  border-color: #3a8fd4;
}

:deep(.el-input-number .el-input__inner) {
  color: #fff;
  text-align: center;
  font-family: 'Courier New', monospace;
}

:deep(.el-input-number__decrease),
:deep(.el-input-number__increase) {
  background: #153a5c;
  border-color: #1e4976;
  color: #66b2ff;
}

:deep(.el-input-number__decrease:hover),
:deep(.el-input-number__increase:hover) {
  background: #1e4976;
  color: #fff;
}

/* Select */
:deep(.el-select) {
  width: 140px;
}

:deep(.el-select .el-input__wrapper),
:deep(.el-select .el-input) {
  background: #0a1628 !important;
  border: 1px solid #1e4976 !important;
  box-shadow: none !important;
}

:deep(.el-select .el-input__wrapper:hover) {
  border-color: #3a8fd4 !important;
}

:deep(.el-select .el-input__wrapper.is-focus) {
  border-color: #3a8fd4 !important;
  box-shadow: 0 0 0 2px rgba(58, 143, 212, 0.1) !important;
}

:deep(.el-select .el-input__inner) {
  color: #fff !important;
  background: transparent !important;
}

:deep(.el-select .el-input__suffix) {
  color: #66b2ff !important;
}

:deep(.el-select-dropdown) {
  background: #0f2a44 !important;
  border: 1px solid #1e4976 !important;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

:deep(.el-select-dropdown__item) {
  color: #66b2ff !important;
  padding: 10px 16px;
  font-size: 13px;
  background: transparent !important;
}

:deep(.el-select-dropdown__item:hover) {
  background: rgba(58, 143, 212, 0.15) !important;
}

:deep(.el-select-dropdown__item.selected) {
  color: #8ab4d8 !important;
  background: rgba(58, 143, 212, 0.25) !important;
  font-weight: 500;
}

:deep(.el-select-dropdown__item.empty),
:deep(.el-select-dropdown__item.placeholder) {
  background: #0f2a44 !important;
  color: #5a7a9a !important;
}

/* Switch */
:deep(.el-switch__core) {
  background: #1e4976;
  border-color: #1e4976;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background: #2d7dd2;
  border-color: #2d7dd2;
}

:deep(.el-switch__label) {
  color: #5a7a9a;
  font-size: 12px;
}

:deep(.el-switch__label.is-active) {
  color: #8ab4d8;
}

/* Dropdown */
:deep(.el-dropdown-menu) {
  background: linear-gradient(180deg, #153a5c 0%, #0f2a44 100%);
  border: 1px solid #1e4976;
  border-radius: 6px;
  padding: 6px 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

:deep(.el-dropdown-menu__item) {
  color: #66b2ff;
  font-size: 13px;
  padding: 10px 16px;
}

:deep(.el-dropdown-menu__item:hover) {
  background: rgba(58, 143, 212, 0.15);
  color: #8ab4d8;
}

/* Message */
:deep(.el-message) {
  background: linear-gradient(180deg, #153a5c 0%, #0f2a44 100%);
  border: 1px solid #1e4976;
  color: #8ab4d8;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

:deep(.el-message--success) {
  background: linear-gradient(180deg, #1a3d2c 0%, #0f2918 100%);
  border-color: #2d6a4f;
}

:deep(.el-message--warning) {
  background: linear-gradient(180deg, #3d3a1a 0%, #29260f 100%);
  border-color: #6a5a2d;
}

:deep(.el-message--danger) {
  background: linear-gradient(180deg, #3d1a1a 0%, #290f0f 100%);
  border-color: #6a2d2d;
}

/* 滚动条 */
.spectrum-instances::-webkit-scrollbar {
  width: 8px;
}

.spectrum-instances::-webkit-scrollbar-track {
  background: #0a1628;
}

.spectrum-instances::-webkit-scrollbar-thumb {
  background: #1e4976;
  border-radius: 4px;
}

.spectrum-instances::-webkit-scrollbar-thumb:hover {
  background: #3a6b9c;
}
</style>
