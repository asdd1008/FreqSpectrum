class SpectrumDataGenerator {
  constructor(options = {}) {
    this.config = {
      centerFreq: 1000000000,
      span: 100000000,
      freqResolution: 1000000,
      refLevel: 0,
      gain: 20,
      ...options
    }
    
    this.time = 0
    this.frameCount = 0
    
    this.signals = this.initSignals()
    
    this.noiseState = {
      baseNoiseFloor: -85,
      noiseVariation: 0,
      lastNoiseUpdate: 0
    }
    
    this.interferenceState = {
      active: false,
      type: null,
      startTime: 0,
      duration: 0,
      position: 0,
      level: 0
    }
  }

  initSignals() {
    return {
      cwSignals: [
        {
          freqOffset: 0.1,
          bandwidth: 0.002,
          level: -20,
          driftRate: 0.0001,
          driftPhase: 0,
          stable: true
        },
        {
          freqOffset: 0.25,
          bandwidth: 0.001,
          level: -35,
          driftRate: 0,
          driftPhase: 0,
          stable: true
        }
      ],
      modulatedSignals: [
        {
          freqOffset: 0.5,
          bandwidth: 0.05,
          level: -30,
          modulationType: 'am',
          modulationDepth: 0.3,
          modulationFreq: 0.2
        },
        {
          freqOffset: 0.7,
          bandwidth: 0.08,
          level: -25,
          modulationType: 'fm',
          modulationDepth: 0.5,
          modulationFreq: 0.1
        }
      ],
      pulseSignals: [
        {
          freqOffset: 0.85,
          bandwidth: 0.01,
          level: -15,
          pulsePeriod: 50,
          pulseWidth: 10,
          pulsePhase: 0
        }
      ],
      harmonics: {
        baseFreqOffset: 0.1,
        harmonicLevels: [-20, -45, -60, -75]
      }
    }
  }

  setConfig(config) {
    Object.assign(this.config, config)
    this.signals = this.initSignals()
  }

  generate() {
    const points = Math.floor(this.config.span / this.config.freqResolution)
    if (points < 1) points = 1
    
    const minLevel = this.config.refLevel - 100
    const maxLevel = this.config.refLevel
    const data = new Float32Array(points)
    
    this.updateNoiseState()
    this.updateInterference()
    
    for (let i = 0; i < points; i++) {
      const freqRatio = i / (points - 1)
      let value = this.generateNoise(freqRatio, points)
      
      value = this.addCWSignals(value, freqRatio, maxLevel, minLevel)
      value = this.addModulatedSignals(value, freqRatio, maxLevel, minLevel)
      value = this.addPulseSignals(value, freqRatio, maxLevel, minLevel)
      value = this.addHarmonics(value, freqRatio, maxLevel, minLevel)
      value = this.addInterference(value, freqRatio, maxLevel, minLevel)
      
      value = this.applyFilterShape(value, freqRatio, minLevel)
      
      data[i] = Math.max(minLevel, Math.min(maxLevel, value))
    }
    
    this.time += 0.05
    this.frameCount++
    
    return data
  }

  updateNoiseState() {
    if (this.frameCount - this.noiseState.lastNoiseUpdate > 10) {
      this.noiseState.noiseVariation = (Math.random() - 0.5) * 2
      this.noiseState.lastNoiseUpdate = this.frameCount
    }
  }

  generateNoise(freqRatio, points) {
    const baseNoise = this.noiseState.baseNoiseFloor + this.noiseState.noiseVariation
    
    const thermalNoise = baseNoise + (Math.random() - 0.5) * 3
    
    const flickerNoise = Math.sin(this.time * 0.01 + freqRatio * 10) * 2
    
    const burstNoise = Math.random() < 0.001 ? (Math.random() - 0.5) * 20 : 0
    
    return thermalNoise + flickerNoise + burstNoise
  }

  addCWSignals(value, freqRatio, maxLevel, minLevel) {
    this.signals.cwSignals.forEach(sig => {
      const driftedOffset = sig.freqOffset + Math.sin(this.time * sig.driftRate + sig.driftPhase) * 0.005
      const dist = Math.abs(freqRatio - driftedOffset)
      
      if (dist < sig.bandwidth * 3) {
        const gaussian = Math.exp(-(dist * dist) / (sig.bandwidth * sig.bandwidth * 0.5))
        const levelVariation = sig.stable ? 0 : (Math.random() - 0.5) * 2
        const signalLevel = sig.level + levelVariation
        value = Math.max(value, signalLevel * gaussian + value * (1 - gaussian))
      }
    })
    
    return value
  }

  addModulatedSignals(value, freqRatio, maxLevel, minLevel) {
    this.signals.modulatedSignals.forEach(sig => {
      const dist = Math.abs(freqRatio - sig.freqOffset)
      
      if (dist < sig.bandwidth) {
        let modulationEffect
        
        if (sig.modulationType === 'am') {
          modulationEffect = 1 + Math.sin(this.time * sig.modulationFreq) * sig.modulationDepth
        } else if (sig.modulationType === 'fm') {
          const freqDeviation = Math.sin(this.time * sig.modulationFreq) * sig.modulationDepth * sig.bandwidth
          const effectiveDist = Math.abs(freqRatio - sig.freqOffset - freqDeviation)
          modulationEffect = Math.exp(-(effectiveDist * effectiveDist) / (sig.bandwidth * sig.bandwidth * 0.25))
        } else {
          modulationEffect = 1
        }
        
        const envelope = Math.max(0, 1 - dist / sig.bandwidth)
        const levelVariation = (Math.random() - 0.5) * 1
        
        if (sig.modulationType === 'fm') {
          value = Math.max(value, sig.level + levelVariation + envelope * 5)
        } else {
          value += (sig.level + levelVariation - value) * envelope * modulationEffect
        }
      }
    })
    
    return value
  }

  addPulseSignals(value, freqRatio, maxLevel, minLevel) {
    this.signals.pulseSignals.forEach(sig => {
      const pulsePhase = (this.frameCount + sig.pulsePhase) % sig.pulsePeriod
      const isPulseActive = pulsePhase < sig.pulseWidth
      
      if (isPulseActive) {
        const dist = Math.abs(freqRatio - sig.freqOffset)
        
        if (dist < sig.bandwidth * 2) {
          const gaussian = Math.exp(-(dist * dist) / (sig.bandwidth * sig.bandwidth * 0.5))
          const pulseEnvelope = 1 - (pulsePhase / sig.pulseWidth) * 0.3
          const signalLevel = sig.level + (Math.random() - 0.5) * 2
          value = Math.max(value, (signalLevel * gaussian * pulseEnvelope))
        }
      }
    })
    
    return value
  }

  addHarmonics(value, freqRatio, maxLevel, minLevel) {
    const baseFreq = this.signals.harmonics.baseFreqOffset
    
    this.signals.harmonics.harmonicLevels.forEach((level, harmonicIndex) => {
      const harmonicFreq = baseFreq * (harmonicIndex + 2)
      if (harmonicFreq > 1) return
      
      const dist = Math.abs(freqRatio - harmonicFreq)
      const bandwidth = 0.002 * (harmonicIndex + 1)
      
      if (dist < bandwidth * 3) {
        const gaussian = Math.exp(-(dist * dist) / (bandwidth * bandwidth * 0.5))
        value = Math.max(value, level * gaussian)
      }
    })
    
    return value
  }

  updateInterference() {
    if (!this.interferenceState.active && Math.random() < 0.002) {
      this.interferenceState.active = true
      this.interferenceState.type = Math.random() < 0.5 ? 'narrowband' : 'wideband'
      this.interferenceState.startTime = this.frameCount
      this.interferenceState.duration = 20 + Math.random() * 50
      this.interferenceState.position = Math.random()
      this.interferenceState.level = -40 + Math.random() * 20
    }
    
    if (this.interferenceState.active) {
      if (this.frameCount - this.interferenceState.startTime > this.interferenceState.duration) {
        this.interferenceState.active = false
      }
    }
  }

  addInterference(value, freqRatio, maxLevel, minLevel) {
    if (!this.interferenceState.active) return value
    
    const interferenceType = this.interferenceState.type
    const position = this.interferenceState.position
    const level = this.interferenceState.level
    
    if (interferenceType === 'narrowband') {
      const dist = Math.abs(freqRatio - position)
      if (dist < 0.01) {
        const gaussian = Math.exp(-(dist * dist) / 0.00005)
        const flicker = Math.sin(this.time * 2) * 5
        value = Math.max(value, (level + flicker) * gaussian)
      }
    } else if (interferenceType === 'wideband') {
      if (Math.abs(freqRatio - position) < 0.15) {
        const sweptFreq = position + Math.sin(this.time * 0.5) * 0.05
        const dist = Math.abs(freqRatio - sweptFreq)
        if (dist < 0.1) {
          value = Math.max(value, level + dist * 10)
        }
      }
    }
    
    return value
  }

  applyFilterShape(value, freqRatio, minLevel) {
    const edgeAttenuation = Math.sin(freqRatio * Math.PI)
    const rolloff = Math.pow(edgeAttenuation, 0.3)
    
    const centerBoost = Math.exp(-Math.pow((freqRatio - 0.5) * 4, 2)) * 2
    
    value = minLevel + (value - minLevel) * rolloff + centerBoost
    
    return value
  }

  generateLevel() {
    const baseLevel = this.config.refLevel - 60
    
    const slowDrift = Math.sin(this.time * 0.05) * 8
    const mediumVariation = Math.sin(this.time * 0.2) * 4
    const fastNoise = (Math.random() - 0.5) * 3
    
    const burst = Math.random() < 0.01 ? (Math.random() > 0.5 ? 15 : -10) : 0
    
    return baseLevel + slowDrift + mediumVariation + fastNoise + burst
  }
}

export default SpectrumDataGenerator