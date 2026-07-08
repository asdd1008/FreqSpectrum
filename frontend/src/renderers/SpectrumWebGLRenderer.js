export class SpectrumWebGLRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    
    if (!this.gl) {
      throw new Error('WebGL not supported')
    }
    
    this.options = {
      padding: { top: 20, right: 60, bottom: 40, left: 60 },
      waterfallHeight: 200,
      ...options
    }
    
    this.spectrumData = null
    this.waterfallData = []
    this.centerFreq = 1000000000
    this.span = 100000000
    this.refLevel = 0
    this.minLevel = -100
    this.maxLevel = 0
    
    this.programs = {}
    this.buffers = {}
    this.textures = {}
    
    this.initGL()
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
    const gl = this.gl
    
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
    const gl = this.gl
    
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
    const gl = this.gl
    
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
    
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return null
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
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.width = rect.width
    this.height = rect.height
    this.dpr = dpr
    this.calculateAreas()
  }

  calculateAreas() {
    const { padding, waterfallHeight } = this.options
    const axisLabelHeight = 25
    
    this.plotArea = {
      x: padding.left,
      y: padding.top,
      width: this.width - padding.left - padding.right,
      height: this.height - padding.top - padding.bottom - waterfallHeight - axisLabelHeight * 2
    }
    
    this.waterfallArea = {
      x: padding.left,
      y: this.height - padding.bottom - waterfallHeight - axisLabelHeight,
      width: this.width - padding.left - padding.right,
      height: waterfallHeight
    }
  }

  setConfig(config) {
    if (config.centerFreq !== undefined) this.centerFreq = config.centerFreq
    if (config.span !== undefined) this.span = config.span
    if (config.refLevel !== undefined) {
      this.refLevel = config.refLevel
      this.maxLevel = config.refLevel
      this.minLevel = config.refLevel - 100
    }
    if (config.waterfallHeight !== undefined) {
      this.options.waterfallHeight = config.waterfallHeight
      this.calculateAreas()
    }
  }

  setData(data) {
    if (data.spectrum) this.spectrumData = data.spectrum
    if (data.waterfall) this.waterfallData = data.waterfall
  }

  render() {
    const gl = this.gl
    
    gl.clear(gl.COLOR_BUFFER_BIT)
    
    this.drawGrid()
    this.drawWaterfall()
    this.drawSpectrum()
  }

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
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const minLevelLocation = gl.getUniformLocation(program, 'u_minLevel')
    const maxLevelLocation = gl.getUniformLocation(program, 'u_maxLevel')
    const plotXLocation = gl.getUniformLocation(program, 'u_plotX')
    const plotYLocation = gl.getUniformLocation(program, 'u_plotY')
    const plotWidthLocation = gl.getUniformLocation(program, 'u_plotWidth')
    const plotHeightLocation = gl.getUniformLocation(program, 'u_plotHeight')
    const colorLocation = gl.getUniformLocation(program, 'u_color')
    
    gl.uniform2f(resolutionLocation, this.width, this.height)
    gl.uniform1f(minLevelLocation, this.minLevel)
    gl.uniform1f(maxLevelLocation, this.maxLevel)
    gl.uniform1f(plotXLocation, this.plotArea.x)
    gl.uniform1f(plotYLocation, this.plotArea.y)
    gl.uniform1f(plotWidthLocation, this.plotArea.width)
    gl.uniform1f(plotHeightLocation, this.plotArea.height)
    gl.uniform4f(colorLocation, 0.0, 1.0, 0.53, 1.0)
    
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

  drawWaterfall() {
    if (!this.waterfallData || this.waterfallData.length === 0) return
    
    const gl = this.gl
    const program = this.programs.waterfall
    
    gl.useProgram(program)
    
    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')
    const textureLocation = gl.getUniformLocation(program, 'u_texture')
    const minLevelLocation = gl.getUniformLocation(program, 'u_minLevel')
    const maxLevelLocation = gl.getUniformLocation(program, 'u_maxLevel')
    
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
    
    const vertices = new Float32Array([
      x1, y2, 0, 0,
      x2, y2, 1, 0,
      x1, y1, 0, 1,
      x2, y1, 1, 1
    ])
    
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(texCoordLocation)
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8)
    
    gl.uniform1i(textureLocation, 0)
    gl.uniform1f(minLevelLocation, this.minLevel)
    gl.uniform1f(maxLevelLocation, this.maxLevel)
    
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    
    gl.deleteTexture(texture)
    gl.deleteBuffer(buffer)
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
    return this.canvas.toDataURL('image/png')
  }

  destroy() {
    const gl = this.gl
    Object.values(this.programs).forEach(p => gl.deleteProgram(p))
  }
}

export default SpectrumWebGLRenderer
