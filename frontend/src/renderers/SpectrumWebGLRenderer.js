export class SpectrumWebGLRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

    if (!this.gl) {
      throw new Error('WebGL not supported')
    }

    // 2D overlay canvas for axis, legend, crosshairs, etc.
    this.overlayCanvas = options.overlayCanvas || null
    this.ctx = null
    if (this.overlayCanvas) {
      this.ctx = this.overlayCanvas.getContext('2d')
    }

    this.options = {
      padding: { top: 20, right: 60, bottom: 40, left: 60 },
      waterfallHeight: 200,
      showGrid: true,
      showAxis: true,
      showLegend: true,
      ...options
    }

    this.spectrumData = null
    this.maxHoldData = null
    this.minHoldData = null
    this.avgData = null
    this.waterfallData = []

    this.centerFreq = 1000000000
    this.span = 100000000
    this.refLevel = 0
    this.minLevel = -100
    this.maxLevel = 0

    this.baseCenterFreq = 1000000000
    this.baseSpan = 100000000
    this.baseRefLevel = 0
    this.baseMinLevel = -100
    this.baseMaxLevel = 0

    this.markers = []
    this.levelIndicator = null
    this.boxSelection = null
    this.rightBoxSelection = null
    this.mousePosition = null
    this.timeLine = 0
    this.dpr = 1

    this.zoomX = 1
    this.zoomY = 1
    this.panX = 0
    this.panY = 0

    this.highlightedSignals = []

    this.programs = {}
    this.buffers = {}
    this.textures = {}

    this.initGL()
  }

  setOverlayCanvas(canvas) {
    this.overlayCanvas = canvas
    this.ctx = canvas ? canvas.getContext('2d') : null
    this.resize()
  }

  initGL() {
    const gl = this.gl

    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    this.initSpectrumProgram()
    this.initWaterfallProgram()
    this.initGridProgram()

    this.resize()
  }

  initSpectrumProgram() {
    const vsSource = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      uniform float u_minLevel;
      uniform float u_maxLevel;
      uniform float u_plotX;
      uniform float u_plotY;
      uniform float u_plotWidth;
      uniform float u_plotHeight;

      varying float v_level;

      void main() {
        float level = a_position.y;
        float normalizedY = (level - u_minLevel) / (u_maxLevel - u_minLevel);
        normalizedY = clamp(normalizedY, 0.0, 1.0);

        float x = u_plotX + a_position.x * u_plotWidth;
        float y = u_plotY + u_plotHeight * (1.0 - normalizedY);

        vec2 clipSpace = vec2(
          (x / u_resolution.x) * 2.0 - 1.0,
          (y / u_resolution.y) * -2.0 + 1.0
        );

        gl_Position = vec4(clipSpace, 0.0, 1.0);
        v_level = level;
      }
    `

    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;

      void main() {
        gl_FragColor = u_color;
      }
    `

    this.programs.spectrum = this.createProgram(vsSource, fsSource)
  }

  initWaterfallProgram() {
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `

    const fsSource = `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_minLevel;
      uniform float u_maxLevel;
      varying vec2 v_texCoord;

      vec3 getWaterfallColor(float value) {
        float ratio = clamp((value - u_minLevel) / (u_maxLevel - u_minLevel), 0.0, 1.0);

        if (ratio < 0.25) {
          float t = ratio / 0.25;
          return vec3(0.0, 0.0, t);
        } else if (ratio < 0.5) {
          float t = (ratio - 0.25) / 0.25;
          return vec3(0.0, t, 1.0);
        } else if (ratio < 0.75) {
          float t = (ratio - 0.5) / 0.25;
          return vec3(t, 1.0, 1.0 - t);
        } else {
          float t = (ratio - 0.75) / 0.25;
          return vec3(1.0, 1.0 - t, 0.0);
        }
      }

      void main() {
        float value = texture2D(u_texture, v_texCoord).r;
        vec3 color = getWaterfallColor(value);
        gl_FragColor = vec4(color, 1.0);
      }
    `

    this.programs.waterfall = this.createProgram(vsSource, fsSource)
  }

  initGridProgram() {
    const vsSource = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;

      void main() {
        vec2 clipSpace = vec2(
          (a_position.x / u_resolution.x) * 2.0 - 1.0,
          (a_position.y / u_resolution.y) * -2.0 + 1.0
        );
        gl_Position = vec4(clipSpace, 0.0, 1.0);
      }
    `

    const fsSource = `
      precision mediump float;
      uniform vec4 u_color;

      void main() {
        gl_FragColor = u_color;
      }
    `

    this.programs.grid = this.createProgram(vsSource, fsSource)
  }

  createProgram(vsSource, fsSource) {
    const gl = this.gl

    const vs = this.createShader(gl.VERTEX_SHADER, vsSource)
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource)

    if (!vs || !fs) {
      throw new Error('Shader creation failed')
    }

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program)
      console.error('Program link error:', error)
      throw new Error(`Program link error: ${error}`)
    }

    return program
  }

  createShader(type, source) {
    const gl = this.gl
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }

    return shader
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.dpr = dpr
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.width = rect.width
    this.height = rect.height

    // Also resize overlay canvas
    if (this.overlayCanvas) {
      this.overlayCanvas.width = rect.width * dpr
      this.overlayCanvas.height = rect.height * dpr
      this.overlayCanvas.style.width = rect.width + 'px'
      this.overlayCanvas.style.height = rect.height + 'px'
    }

    this.calculateAreas()
  }

  isInPlotArea(x, y) {
    return x >= this.plotArea.x && x <= this.plotArea.x + this.plotArea.width &&
           y >= this.plotArea.y && y <= this.plotArea.y + this.plotArea.height
  }

  addWaterfallLine(data) {
    if (!data || data.length === 0) return
    this.waterfallData.push(Array.from(data))
    const maxLines = 200
    if (this.waterfallData.length > maxLines) {
      this.waterfallData = this.waterfallData.slice(-maxLines)
    }
  }

  clearWaterfall() {
    this.waterfallData = []
  }

  calculateAreas() {
    const { padding, waterfallHeight } = this.options
    const hasWaterfall = waterfallHeight > 0
    const axisLabelHeight = 25

    if (hasWaterfall) {
      // 瀑布图显示时：频谱图和瀑布图各占50%
      const totalUsableHeight = this.height - padding.top - padding.bottom
      const spectrumHeight = totalUsableHeight * 0.5
      const waterfallAreaHeight = totalUsableHeight * 0.5

      this.plotArea = {
        x: padding.left,
        y: padding.top,
        width: this.width - padding.left - padding.right,
        height: spectrumHeight - axisLabelHeight
      }

      this.waterfallArea = {
        x: padding.left,
        y: padding.top + spectrumHeight + axisLabelHeight,
        width: this.width - padding.left - padding.right,
        height: waterfallAreaHeight - axisLabelHeight
      }
    } else {
      // 瀑布图隐藏时：频谱图占全部高度
      this.plotArea = {
        x: padding.left,
        y: padding.top,
        width: this.width - padding.left - padding.right,
        height: this.height - padding.top - padding.bottom
      }

      this.waterfallArea = {
        x: padding.left,
        y: this.height,
        width: this.width - padding.left - padding.right,
        height: 0
      }
    }
  }

  setConfig(config) {
    if (config.centerFreq !== undefined) {
      this.centerFreq = config.centerFreq
      this.baseCenterFreq = config.centerFreq
    }
    if (config.span !== undefined) {
      this.span = config.span
      this.baseSpan = config.span
    }
    if (config.refLevel !== undefined) {
      this.refLevel = config.refLevel
      this.baseRefLevel = config.refLevel
      this.maxLevel = config.refLevel
      this.baseMaxLevel = config.refLevel
      this.minLevel = config.refLevel - 100
      this.baseMinLevel = config.refLevel - 100
    }
    if (config.waterfallHeight !== undefined) {
      this.options.waterfallHeight = config.waterfallHeight
      this.calculateAreas()
    }
  }

  setData(data) {
    if (data.spectrum) this.spectrumData = data.spectrum
    if (data.maxHold) this.maxHoldData = data.maxHold
    if (data.minHold) this.minHoldData = data.minHold
    if (data.avg) this.avgData = data.avg
    if (data.waterfall) this.waterfallData = data.waterfall
  }

  addMarker(marker) {
    this.markers.push({ id: Date.now(), ...marker })
  }

  removeMarker(id) {
    this.markers = this.markers.filter(m => m.id !== id)
  }

  clearMarkers() {
    this.markers = []
  }

  setLevelIndicator(position) {
    this.levelIndicator = position
  }

  setBoxSelection(selection) {
    this.boxSelection = selection
  }

  setRightBoxSelection(selection) {
    this.rightBoxSelection = selection
  }

  setMousePosition(pos) {
    this.mousePosition = pos
  }

  setTimeLine(time) {
    this.timeLine = time
  }

  zoomAt(x, y, factorX, factorY) {
    const plotX = x - this.plotArea.x
    const plotY = y - this.plotArea.y

    if (plotX < 0 || plotX > this.plotArea.width || plotY < 0 || plotY > this.plotArea.height) {
      return
    }

    const xRatio = plotX / this.plotArea.width
    const yRatio = plotY / this.plotArea.height

    const freqAtMouse = this.centerFreq - this.span / 2 + this.span * xRatio
    const levelAtMouse = this.maxLevel - (this.maxLevel - this.minLevel) * yRatio

    const newZoomX = Math.max(0.1, Math.min(20, this.zoomX * factorX))
    const newZoomY = Math.max(0.1, Math.min(20, this.zoomY * factorY))

    const newSpan = this.baseSpan / newZoomX
    const newLevelRange = (this.baseMaxLevel - this.baseMinLevel) / newZoomY

    const newCenterFreq = freqAtMouse + (0.5 - xRatio) * newSpan
    const newMaxLevel = levelAtMouse + yRatio * newLevelRange
    const newMinLevel = newMaxLevel - newLevelRange

    this.zoomX = newZoomX
    this.zoomY = newZoomY
    this.centerFreq = newCenterFreq
    this.span = newSpan
    this.minLevel = newMinLevel
    this.maxLevel = newMaxLevel
  }

  resetZoom() {
    this.zoomX = 1
    this.zoomY = 1
    this.panX = 0
    this.panY = 0
    this.centerFreq = this.baseCenterFreq
    this.span = this.baseSpan
    this.refLevel = this.baseRefLevel
    this.minLevel = this.baseMinLevel
    this.maxLevel = this.baseMaxLevel
  }

  addHighlightedSignal(signal) {
    const existing = this.highlightedSignals.find(s => s.freq === signal.freq && s.bandwidth === signal.bandwidth)
    if (!existing) {
      this.highlightedSignals.push({
        id: signal.id || Date.now(),
        freq: signal.freq,
        bandwidth: signal.bandwidth,
        maxLevel: signal.maxLevel,
        color: signal.color || '#00ff88',
        ...signal
      })
    }
  }

  removeHighlightedSignal(id) {
    this.highlightedSignals = this.highlightedSignals.filter(s => s.id !== id)
  }

  clearHighlightedSignals() {
    this.highlightedSignals = []
  }

  getHoverData(x, y) {
    const freq = this.getFreqAtX(x)
    const level = this.getLevelAtY(y)

    if (freq === null || level === null) return null

    const points = this.spectrumData?.length || 1
    const index = Math.round(((x - this.plotArea.x) / this.plotArea.width) * (points - 1))
    const clampedIndex = Math.max(0, Math.min(points - 1, index))
    const actualLevel = this.spectrumData?.[clampedIndex] || this.minLevel

    const nearbyData = []
    const searchRadius = Math.floor(points * 0.05)
    for (let i = Math.max(0, clampedIndex - searchRadius); i <= Math.min(points - 1, clampedIndex + searchRadius); i++) {
      const px = this.plotArea.x + (this.plotArea.width / (points - 1)) * i
      const pl = this.spectrumData?.[i] || this.minLevel
      nearbyData.push({ x: px, level: pl })
    }

    let maxNearby = this.minLevel
    let maxIndex = clampedIndex
    for (let i = 0; i < nearbyData.length; i++) {
      if (nearbyData[i].level > maxNearby) {
        maxNearby = nearbyData[i].level
        maxIndex = Math.max(0, clampedIndex - searchRadius) + i
      }
    }
    const maxFreq = this.centerFreq - this.span / 2 + (maxIndex / (points - 1)) * this.span

    return {
      freq,
      level: actualLevel,
      maxLevel: maxNearby,
      maxFreq,
      bandwidth: this.span / points,
      index: clampedIndex
    }
  }

  render() {
    const gl = this.gl

    gl.clear(gl.COLOR_BUFFER_BIT)

    // WebGL rendering: grid, spectrum, waterfall
    this.drawGrid()

    if (this.waterfallData.length > 0) {
      this.drawWaterfall()
    }

    this.drawSpectrum()

    if (this.maxHoldData) this.drawMaxHold()
    if (this.minHoldData) this.drawMinHold()
    if (this.avgData) this.drawAvg()

    // 2D overlay rendering on separate canvas
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)
      this.ctx.save()
      this.ctx.scale(this.dpr, this.dpr)

      this.drawAxis()
      this.drawLegend()
      this.drawHighlightedSignals()
      this.drawMarkers()
      this.drawLevelIndicator()
      this.drawBoxSelection()
      this.drawRightBoxSelection()
      this.drawCrosshairs()
      this.drawTimeLine()

      this.ctx.restore()
    }
  }

  // ---- WebGL drawing methods ----

  drawGrid() {
    const gl = this.gl
    const program = this.programs.grid

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const colorLocation = gl.getUniformLocation(program, 'u_color')

    gl.uniform2f(resolutionLocation, this.width, this.height)
    gl.uniform4f(colorLocation, 0.1, 0.23, 0.36, 1.0)

    const vertices = []
    const gridCountX = 10
    const gridCountY = 10

    for (let i = 0; i <= gridCountX; i++) {
      const x = this.plotArea.x + (this.plotArea.width / gridCountX) * i
      vertices.push(x, this.plotArea.y)
      vertices.push(x, this.plotArea.y + this.plotArea.height)
    }

    for (let i = 0; i <= gridCountY; i++) {
      const y = this.plotArea.y + (this.plotArea.height / gridCountY) * i
      vertices.push(this.plotArea.x, y)
      vertices.push(this.plotArea.x + this.plotArea.width, y)
    }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.LINES, 0, vertices.length / 2)

    gl.deleteBuffer(buffer)
  }

  drawSpectrum() {
    if (!this.spectrumData || this.spectrumData.length === 0) return

    const gl = this.gl
    const program = this.programs.spectrum

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), this.width, this.height)
    gl.uniform1f(gl.getUniformLocation(program, 'u_minLevel'), this.minLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_maxLevel'), this.maxLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotX'), this.plotArea.x)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotY'), this.plotArea.y)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotWidth'), this.plotArea.width)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotHeight'), this.plotArea.height)
    gl.uniform4f(gl.getUniformLocation(program, 'u_color'), 0.0, 1.0, 0.53, 1.0)

    const points = this.spectrumData.length
    const vertices = new Float32Array(points * 2)

    for (let i = 0; i < points; i++) {
      vertices[i * 2] = i / (points - 1)
      vertices[i * 2 + 1] = this.spectrumData[i]
    }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    gl.lineWidth(1.5)
    gl.drawArrays(gl.LINE_STRIP, 0, points)

    gl.deleteBuffer(buffer)
  }

  drawMaxHold() {
    if (!this.maxHoldData || this.maxHoldData.length === 0) return

    const gl = this.gl
    const program = this.programs.spectrum

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), this.width, this.height)
    gl.uniform1f(gl.getUniformLocation(program, 'u_minLevel'), this.minLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_maxLevel'), this.maxLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotX'), this.plotArea.x)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotY'), this.plotArea.y)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotWidth'), this.plotArea.width)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotHeight'), this.plotArea.height)
    gl.uniform4f(gl.getUniformLocation(program, 'u_color'), 1.0, 0.42, 0.42, 1.0)

    const points = this.maxHoldData.length
    const vertices = new Float32Array(points * 2)

    for (let i = 0; i < points; i++) {
      vertices[i * 2] = i / (points - 1)
      vertices[i * 2 + 1] = this.maxHoldData[i]
    }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    gl.lineWidth(1)
    gl.drawArrays(gl.LINE_STRIP, 0, points)

    gl.deleteBuffer(buffer)
  }

  drawMinHold() {
    if (!this.minHoldData || this.minHoldData.length === 0) return

    const gl = this.gl
    const program = this.programs.spectrum

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), this.width, this.height)
    gl.uniform1f(gl.getUniformLocation(program, 'u_minLevel'), this.minLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_maxLevel'), this.maxLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotX'), this.plotArea.x)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotY'), this.plotArea.y)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotWidth'), this.plotArea.width)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotHeight'), this.plotArea.height)
    gl.uniform4f(gl.getUniformLocation(program, 'u_color'), 0.31, 0.80, 0.77, 1.0)

    const points = this.minHoldData.length
    const vertices = new Float32Array(points * 2)

    for (let i = 0; i < points; i++) {
      vertices[i * 2] = i / (points - 1)
      vertices[i * 2 + 1] = this.minHoldData[i]
    }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    gl.lineWidth(1)
    gl.drawArrays(gl.LINE_STRIP, 0, points)

    gl.deleteBuffer(buffer)
  }

  drawAvg() {
    if (!this.avgData || this.avgData.length === 0) return

    const gl = this.gl
    const program = this.programs.spectrum

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), this.width, this.height)
    gl.uniform1f(gl.getUniformLocation(program, 'u_minLevel'), this.minLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_maxLevel'), this.maxLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotX'), this.plotArea.x)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotY'), this.plotArea.y)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotWidth'), this.plotArea.width)
    gl.uniform1f(gl.getUniformLocation(program, 'u_plotHeight'), this.plotArea.height)
    gl.uniform4f(gl.getUniformLocation(program, 'u_color'), 1.0, 0.85, 0.23, 1.0)

    const points = this.avgData.length
    const vertices = new Float32Array(points * 2)

    for (let i = 0; i < points; i++) {
      vertices[i * 2] = i / (points - 1)
      vertices[i * 2 + 1] = this.avgData[i]
    }

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    gl.lineWidth(1)
    gl.drawArrays(gl.LINE_STRIP, 0, points)

    gl.deleteBuffer(buffer)
  }

  drawWaterfall() {
    if (!this.waterfallData || this.waterfallData.length === 0) return

    const gl = this.gl
    const program = this.programs.waterfall

    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')

    const lines = this.waterfallData.length
    const points = this.waterfallData[0]?.length || 1

    const textureData = new Float32Array(lines * points)
    for (let y = 0; y < lines; y++) {
      const line = this.waterfallData[y]
      for (let x = 0; x < points; x++) {
        textureData[y * points + x] = line[x]
      }
    }

    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, points, lines, 0, gl.LUMINANCE, gl.FLOAT, textureData)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    const x1 = (this.waterfallArea.x / this.width) * 2 - 1
    const x2 = ((this.waterfallArea.x + this.waterfallArea.width) / this.width) * 2 - 1
    const y1 = 1 - (this.waterfallArea.y / this.height) * 2
    const y2 = 1 - ((this.waterfallArea.y + this.waterfallArea.height) / this.height) * 2

    // 翻转纹理Y坐标，使瀑布图方向与Canvas渲染器一致（最新数据在底部）
    const vertices = new Float32Array([
      x1, y2, 0, 1,
      x2, y2, 1, 1,
      x1, y1, 0, 0,
      x2, y1, 1, 0
    ])

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(texCoordLocation)
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8)

    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0)
    gl.uniform1f(gl.getUniformLocation(program, 'u_minLevel'), this.minLevel)
    gl.uniform1f(gl.getUniformLocation(program, 'u_maxLevel'), this.maxLevel)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.deleteTexture(texture)
    gl.deleteBuffer(buffer)
  }

  // ---- 2D overlay drawing methods (on overlay canvas) ----

  drawAxis() {
    const ctx = this.ctx

    ctx.strokeStyle = '#3a6b9c'
    ctx.lineWidth = 1
    ctx.fillStyle = '#e0e0e0'
    ctx.font = '11px monospace'

    ctx.strokeRect(this.plotArea.x, this.plotArea.y, this.plotArea.width, this.plotArea.height)

    const labelCountX = this.getOptimalLabelCountX()
    const freqFormatter = this.getFreqFormatter()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let i = 0; i <= labelCountX; i++) {
      const ratio = i / labelCountX
      const x = this.plotArea.x + this.plotArea.width * ratio
      const freq = this.centerFreq - this.span / 2 + this.span * ratio
      ctx.fillText(freqFormatter(freq), x, this.plotArea.y + this.plotArea.height + 5)
    }

    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const labelCountY = 5
    for (let i = 0; i <= labelCountY; i++) {
      const ratio = i / labelCountY
      const y = this.plotArea.y + this.plotArea.height * ratio
      const level = this.maxLevel - (this.maxLevel - this.minLevel) * ratio
      ctx.fillText(level.toFixed(0) + ' dBm', this.plotArea.x - 5, y)
    }

    if (this.waterfallArea.height > 0) {
      ctx.strokeStyle = '#3a6b9c'
      ctx.strokeRect(this.waterfallArea.x, this.waterfallArea.y, this.waterfallArea.width, this.waterfallArea.height)

      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let i = 0; i <= labelCountX; i++) {
        const ratio = i / labelCountX
        const x = this.waterfallArea.x + this.waterfallArea.width * ratio
        const freq = this.centerFreq - this.span / 2 + this.span * ratio
        ctx.fillText(freqFormatter(freq), x, this.waterfallArea.y + this.waterfallArea.height + 5)
      }

      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText('时间', this.waterfallArea.x - 5, this.waterfallArea.y + this.waterfallArea.height / 2)
    }
  }

  drawLegend() {
    const ctx = this.ctx

    const legends = []
    legends.push({ color: '#00ff88', label: '实时频谱' })
    if (this.maxHoldData) legends.push({ color: '#ff6b6b', label: '最大保持' })
    if (this.minHoldData) legends.push({ color: '#4ecdc4', label: '最小保持' })
    if (this.avgData) legends.push({ color: '#ffd93d', label: '平均' })

    let x = this.plotArea.x + 10
    const y = this.plotArea.y + 10

    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    legends.forEach((legend, i) => {
      const offsetX = i * 100
      ctx.fillStyle = legend.color
      ctx.fillRect(x + offsetX, y, 14, 14)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + offsetX, y, 14, 14)
      ctx.fillStyle = '#e0e0e0'
      ctx.fillText(legend.label, x + offsetX + 20, y + 2)
    })

    this.drawWaterfallColorBar()
  }

  drawWaterfallColorBar() {
    if (this.waterfallArea.height <= 0) return
    const ctx = this.ctx

    const barWidth = 15
    const barHeight = this.waterfallArea.height
    const barX = this.waterfallArea.x + this.waterfallArea.width + 10
    const barY = this.waterfallArea.y

    ctx.strokeStyle = '#3a6b9c'
    ctx.lineWidth = 1
    ctx.strokeRect(barX, barY, barWidth, barHeight)

    for (let i = 0; i < barHeight; i++) {
      const ratio = 1 - i / barHeight
      const value = this.minLevel + (this.maxLevel - this.minLevel) * ratio
      const color = this.getWaterfallColor(value)
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      ctx.fillRect(barX + 1, barY + i, barWidth - 2, 1)
    }

    ctx.fillStyle = '#e0e0e0'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${this.maxLevel} dBm`, barX + barWidth + 5, barY + 5)
    const midLevel = (this.maxLevel + this.minLevel) / 2
    ctx.fillText(`${midLevel.toFixed(0)} dBm`, barX + barWidth + 5, barY + barHeight / 2)
    ctx.fillText(`${this.minLevel} dBm`, barX + barWidth + 5, barY + barHeight - 5)
  }

  drawCrosshairs() {
    if (!this.mousePosition) return

    const ctx = this.ctx
    const { x, y } = this.mousePosition

    if (x < this.plotArea.x || x > this.plotArea.x + this.plotArea.width ||
        y < this.plotArea.y || y > this.plotArea.y + this.plotArea.height) {
      return
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 0.5
    ctx.setLineDash([4, 4])

    ctx.beginPath()
    ctx.moveTo(x, this.plotArea.y)
    ctx.lineTo(x, this.plotArea.y + this.plotArea.height)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(this.plotArea.x, y)
    ctx.lineTo(this.plotArea.x + this.plotArea.width, y)
    ctx.stroke()

    ctx.setLineDash([])
  }

  drawHighlightedSignals() {
    const ctx = this.ctx

    this.highlightedSignals.forEach(signal => {
      const points = this.spectrumData?.length || 1
      const freqStart = signal.freq - signal.bandwidth / 2
      const freqEnd = signal.freq + signal.bandwidth / 2

      const ratioStart = (freqStart - (this.centerFreq - this.span / 2)) / this.span
      const ratioEnd = (freqEnd - (this.centerFreq - this.span / 2)) / this.span

      const xStart = this.plotArea.x + this.plotArea.width * ratioStart
      const xEnd = this.plotArea.x + this.plotArea.width * ratioEnd

      if (xEnd < this.plotArea.x || xStart > this.plotArea.x + this.plotArea.width) return

      const levelRatio = (signal.maxLevel - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, levelRatio)))

      ctx.fillStyle = `${signal.color}20`
      ctx.fillRect(xStart, this.plotArea.y, xEnd - xStart, this.plotArea.height)

      ctx.strokeStyle = signal.color
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(xStart, this.plotArea.y, xEnd - xStart, this.plotArea.height)
      ctx.setLineDash([])

      ctx.strokeStyle = signal.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(xStart, y)
      ctx.lineTo(xEnd, y)
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      const label = `${(signal.maxLevel || 0).toFixed(1)} dBm`
      ctx.fillText(label, (xStart + xEnd) / 2, y - 5)
    })
  }

  drawMarkers() {
    const ctx = this.ctx

    this.markers.forEach(marker => {
      const points = this.spectrumData?.length || 1
      const x = this.plotArea.x + (this.plotArea.width / (points - 1)) * marker.index

      let level = this.spectrumData?.[marker.index] || this.minLevel
      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const y = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))

      ctx.strokeStyle = '#ffeb3b'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 2])

      ctx.beginPath()
      ctx.moveTo(x, this.plotArea.y)
      ctx.lineTo(x, this.plotArea.y + this.plotArea.height)
      ctx.stroke()

      ctx.setLineDash([])

      ctx.fillStyle = '#ffeb3b'
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#000'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      const label = `M${marker.id}: ${level.toFixed(2)} dBm`
      ctx.fillText(label, x + 8, y - 5)
    })
  }

  drawLevelIndicator() {
    if (!this.levelIndicator) return
    const ctx = this.ctx

    const { x, y } = this.levelIndicator

    if (x >= this.plotArea.x && x <= this.plotArea.x + this.plotArea.width &&
        y >= this.plotArea.y && y <= this.plotArea.y + this.plotArea.height) {

      const points = this.spectrumData?.length || 1
      const index = Math.round(((x - this.plotArea.x) / this.plotArea.width) * (points - 1))
      const clampedIndex = Math.max(0, Math.min(points - 1, index))
      const level = this.spectrumData?.[clampedIndex] || this.minLevel
      const freq = this.centerFreq - this.span / 2 + (clampedIndex / (points - 1)) * this.span

      const ratio = (level - this.minLevel) / (this.maxLevel - this.minLevel)
      const plotY = this.plotArea.y + this.plotArea.height * (1 - Math.max(0, Math.min(1, ratio)))

      ctx.strokeStyle = '#ff5722'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(this.plotArea.x, plotY)
      ctx.lineTo(this.plotArea.x + this.plotArea.width, plotY)
      ctx.stroke()

      ctx.fillStyle = '#ff5722'
      ctx.beginPath()
      ctx.arc(x, plotY, 6, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#ff5722'
      ctx.fillRect(this.plotArea.x + this.plotArea.width + 5, plotY - 10, 50, 20)
      ctx.fillStyle = '#fff'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(level.toFixed(1), this.plotArea.x + this.plotArea.width + 8, plotY)

      this.levelIndicator.freq = freq
      this.levelIndicator.level = level
    }
  }

  drawBoxSelection() {
    if (!this.boxSelection) return
    const ctx = this.ctx

    const { startX, startY, endX, endY } = this.boxSelection

    const x1 = Math.min(startX, endX)
    const x2 = Math.max(startX, endX)
    const width = Math.abs(endX - startX)

    // 与Canvas渲染器一致：水平框选覆盖整个垂直范围，颜色#801E17
    if (width < 5) return

    ctx.fillStyle = 'rgba(128, 30, 23, 0.3)'
    ctx.fillRect(x1, this.plotArea.y, width, this.plotArea.height)

    ctx.strokeStyle = '#801E17'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    ctx.strokeRect(x1, this.plotArea.y, width, this.plotArea.height)
    ctx.setLineDash([])
  }

  drawRightBoxSelection() {
    if (!this.rightBoxSelection) return
    const ctx = this.ctx

    const { startX, startY, endX, endY } = this.rightBoxSelection

    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const width = Math.abs(endX - startX)
    const height = Math.abs(endY - startY)

    ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 4])
    ctx.strokeRect(x, y, width, height)
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255, 165, 0, 0.15)'
    ctx.fillRect(x, y, width, height)
  }

  drawTimeLine() {
    if (!this.timeLine || this.waterfallData.length === 0) return
    const ctx = this.ctx

    const lineHeight = this.waterfallArea.height / this.waterfallData.length
    const y = this.waterfallArea.y + this.timeLine * lineHeight

    ctx.strokeStyle = '#ffeb3b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(this.waterfallArea.x, y)
    ctx.lineTo(this.waterfallArea.x + this.waterfallArea.width, y)
    ctx.stroke()
  }

  // ---- Utility methods ----

  getOptimalLabelCountX() {
    const minLabelWidth = 80
    const maxLabels = Math.floor(this.plotArea.width / minLabelWidth)
    const niceNumbers = [2, 3, 4, 5, 6, 8, 10]
    for (let i = niceNumbers.length - 1; i >= 0; i--) {
      if (niceNumbers[i] <= maxLabels) {
        return niceNumbers[i]
      }
    }
    return 2
  }

  getFreqFormatter() {
    const span = this.span
    if (span >= 1e9) {
      return (f) => (f / 1e9).toFixed(3) + ' GHz'
    } else if (span >= 1e8) {
      return (f) => (f / 1e6).toFixed(1) + ' MHz'
    } else if (span >= 1e7) {
      return (f) => (f / 1e6).toFixed(2) + ' MHz'
    } else if (span >= 1e6) {
      return (f) => (f / 1e6).toFixed(3) + ' MHz'
    } else if (span >= 1e5) {
      return (f) => (f / 1e3).toFixed(1) + ' kHz'
    } else if (span >= 1e4) {
      return (f) => (f / 1e3).toFixed(2) + ' kHz'
    } else {
      return (f) => (f / 1e3).toFixed(3) + ' kHz'
    }
  }

  getWaterfallColor(value) {
    const ratio = (value - this.minLevel) / (this.maxLevel - this.minLevel)
    const clamped = Math.max(0, Math.min(1, ratio))

    let r, g, b

    if (clamped < 0.25) {
      const t = clamped / 0.25
      r = 0; g = 0; b = Math.floor(t * 255)
    } else if (clamped < 0.5) {
      const t = (clamped - 0.25) / 0.25
      r = 0; g = Math.floor(t * 255); b = 255
    } else if (clamped < 0.75) {
      const t = (clamped - 0.5) / 0.25
      r = Math.floor(t * 255); g = 255; b = Math.floor(255 * (1 - t))
    } else {
      const t = (clamped - 0.75) / 0.25
      r = 255; g = Math.floor(255 * (1 - t)); b = 0
    }

    return { r, g, b }
  }

  getFreqAtX(x) {
    if (x < this.plotArea.x || x > this.plotArea.x + this.plotArea.width) return null
    const ratio = (x - this.plotArea.x) / this.plotArea.width
    return this.centerFreq - this.span / 2 + this.span * ratio
  }

  getLevelAtY(y) {
    if (y < this.plotArea.y || y > this.plotArea.y + this.plotArea.height) return null
    const ratio = (y - this.plotArea.y) / this.plotArea.height
    return this.maxLevel - (this.maxLevel - this.minLevel) * ratio
  }

  getIndexAtX(x, points) {
    if (x < this.plotArea.x || x > this.plotArea.x + this.plotArea.width) return -1
    const ratio = (x - this.plotArea.x) / this.plotArea.width
    return Math.round(ratio * (points - 1))
  }

  isInWaterfall(x, y) {
    return x >= this.waterfallArea.x && x <= this.waterfallArea.x + this.waterfallArea.width &&
           y >= this.waterfallArea.y && y <= this.waterfallArea.y + this.waterfallArea.height
  }

  getWaterfallPos(x, y) {
    if (!this.isInWaterfall(x, y)) return null

    const points = this.waterfallData[0]?.length || 1
    const lineHeight = this.waterfallArea.height / Math.max(1, this.waterfallData.length)

    const xRatio = (x - this.waterfallArea.x) / this.waterfallArea.width
    const indexX = Math.round(xRatio * (points - 1))
    const indexY = Math.floor((y - this.waterfallArea.y) / lineHeight)

    return { indexX, indexY }
  }

  takeSnapshot() {
    // Merge WebGL canvas and overlay canvas into one image
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = this.canvas.width
    tempCanvas.height = this.canvas.height
    const tempCtx = tempCanvas.getContext('2d')
    tempCtx.drawImage(this.canvas, 0, 0)
    if (this.overlayCanvas) {
      tempCtx.drawImage(this.overlayCanvas, 0, 0)
    }
    return tempCanvas.toDataURL('image/png')
  }

  dispose() {
    const gl = this.gl
    Object.values(this.programs).forEach(p => gl.deleteProgram(p))
    this.programs = {}
  }
}

export default SpectrumWebGLRenderer
