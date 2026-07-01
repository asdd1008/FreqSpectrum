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
    
    this.peakPositions = [
      { pos: 0.3, width: 0.05, amplitude: 0.4, phase: 0 },
      { pos: 0.5, width: 0.1, amplitude: 0.6, phase: 1 },
      { pos: 0.7, width: 0.03, amplitude: 0.5, phase: 2 },
      { pos: 0.85, width: 0.04, amplitude: 0.3, phase: 3 }
    ]
    
    this.time = 0
  }

  setConfig(config) {
    Object.assign(this.config, config)
  }

  generate() {
    const points = Math.floor(this.config.span / this.config.freqResolution)
    const minLevel = this.config.refLevel - 100
    const maxLevel = this.config.refLevel
    const data = new Float32Array(points)
    
    const noiseFloor = minLevel + 10 + Math.random() * 5
    
    for (let i = 0; i < points; i++) {
      const freqRatio = i / (points - 1)
      
      let value = noiseFloor + (Math.random() - 0.5) * 3
      
      value += Math.sin(freqRatio * Math.PI * 4 + this.time * 0.1) * 2
      value += Math.sin(freqRatio * Math.PI * 8 + this.time * 0.15 + 1) * 1.5
      
      this.peakPositions.forEach(peak => {
        const dist = Math.abs(freqRatio - peak.pos)
        if (dist < peak.width * 2) {
          const peakFactor = Math.exp(-(dist * dist) / (peak.width * peak.width * 0.5))
          const modulation = 1 + Math.sin(this.time * 0.5 + peak.phase) * 0.2
          value += peakFactor * (maxLevel - minLevel) * peak.amplitude * modulation
        }
      })
      
      const rolloff = Math.pow(Math.sin(freqRatio * Math.PI), 0.5)
      value = noiseFloor + (value - noiseFloor) * rolloff
      
      data[i] = Math.max(minLevel, Math.min(maxLevel, value))
    }
    
    this.time += 0.05
    
    return data
  }

  generateLevel() {
    const baseLevel = this.config.refLevel - 60
    const noise = (Math.random() - 0.5) * 15
    const signal = Math.sin(this.time * 0.3) * 8
    return baseLevel + noise + signal
  }
}

export default SpectrumDataGenerator
