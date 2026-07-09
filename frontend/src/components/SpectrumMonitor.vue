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
              <div class="section-title">渲染方式</div>
              <div class="form-grid">
                <div class="form-row">
                  <label class="form-label">
                    <span class="label-icon">&#x1F5A5;</span>
                    渲染模式
                  </label>
                  <div class="form-control">
                    <el-radio-group v-model="instance.rendererSettings.useWebGL" size="small">
                      <el-radio :value="false">Canvas</el-radio>
                      <el-radio :value="true">WebGL</el-radio>
                    </el-radio-group>
                  </div>
                </div>
              </div>
            </div>
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
      gain: 20,
      useWebGL: false
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
  const waterfallHeight = instance.config.waterfallEnabled ? (rect.height * 0.5) : 0;
  let RendererClass = instance.config.useWebGL ? SpectrumWebGLRenderer : SpectrumCanvasRenderer;
  
  try {
    instance.renderer = markRaw(new RendererClass(canvas, {
      waterfallHeight
    }));
  } catch (e) {
    if (instance.config.useWebGL && e.message?.includes('WebGL')) {
      instance.config.useWebGL = false;
      RendererClass = SpectrumCanvasRenderer;
      instance.renderer = markRaw(new RendererClass(canvas, {
        waterfallHeight
      }));
      ElMessage.warning('WebGL不支持，已切换到Canvas渲染');
    } else {
      throw e;
    }
  }
  
  instance.renderer.setConfig({
    centerFreq: instance.config.centerFreq,
    span: instance.config.span,
    refLevel: instance.config.refLevel
  });
  startInstanceRenderLoop(instance);
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
      instance.rendererSettings.useWebGL = instance.config.useWebGL;
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
      const needRecreateRenderer = instance.config.useWebGL !== instance.rendererSettings.useWebGL;
      instance.config.sweepTime = instance.rendererSettings.sweepTime;
      instance.config.freqResolution = instance.rendererSettings.freqResolution * 1e3;
      instance.config.sweepMode = instance.rendererSettings.sweepMode;
      instance.config.gain = instance.rendererSettings.gain;
      instance.config.useWebGL = instance.rendererSettings.useWebGL;
      if (needRecreateRenderer && instance.canvas) {
        // 切换渲染模式，重新创建渲染器
        stopInstanceRenderLoop(instance);
        if (instance.renderer) {
          instance.renderer.dispose?.();
        }
        initInstanceRenderer(instance, instance.canvas);
      }
      // 重启数据循环以应用新的扫描时间
      stopInstanceDataLoop(instance);
      startInstanceDataLoop(instance);
      break;
    }
  }
  instance.settingsDialogVisible = false;
  ElMessage.success('设置已应用');
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
 const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
 const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
 await wsManager.connect(wsUrl);
 wsManager.send('subscribe', { channel: 'spectrum' });
 wsManager.subscribe('spectrumData', (data) => {
 if (worker && isPlaying.value && !isPlaybackMode.value) {
 stopDataLoop();
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
