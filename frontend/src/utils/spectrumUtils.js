export const defaultSpectrumConfig = {
  centerFreq: 1000000000,
  span: 100000000,
  freqResolution: 1000000,
  gain: 20,
  refLevel: 0,
  rbw: 1000000,
  vbw: 1000000,
  sweepMode: 'sweep',
  startFreq: 900000000,
  endFreq: 1100000000,
  sweepTime: 100,
  maxHold: true,
  minHold: false,
  avgHold: false,
  waterfallEnabled: false,
  waterfallHeight: 200,
  useWebGL: true,
  showSweepParams: true
}

export const defaultLevelConfig = {
  channel: 1,
  centerFreq: 1000000000,
  span: 10000000,
  freqResolution: 100000,
  alarmLevel: -50,
  enabled: true,
  refLevel: 0,
  rbw: 100000,
  vbw: 100000
}

export const spectrumColors = {
  background: '#000000',
  grid: '#1a3a5c',
  axis: '#3a6b9c',
  spectrum: '#00ff88',
  maxHold: '#ff6b6b',
  minHold: '#4ecdc4',
  avgHold: '#ffd93d',
  marker: '#ffeb3b',
  levelIndicator: '#ff5722',
  waterfallBg: '#000000',
  border: '#1e4976',
  text: '#e0e0e0'
}

export const waterfallColorMap = (value, min, max) => {
  const ratio = (value - min) / (max - min)
  const clamped = Math.max(0, Math.min(1, ratio))
  
  if (clamped < 0.25) {
    const t = clamped / 0.25
    return `rgb(0, 0, ${Math.floor(t * 255)})`
  } else if (clamped < 0.5) {
    const t = (clamped - 0.25) / 0.25
    return `rgb(0, ${Math.floor(t * 255)}, 255)`
  } else if (clamped < 0.75) {
    const t = (clamped - 0.5) / 0.25
    return `rgb(${Math.floor(t * 255)}, 255, ${Math.floor(255 * (1 - t))})`
  } else {
    const t = (clamped - 0.75) / 0.25
    return `rgb(255, ${Math.floor(255 * (1 - t))}, 0)`
  }
}

export const formatFreq = (freq) => {
  if (freq >= 1e9) return (freq / 1e9).toFixed(3) + ' GHz'
  if (freq >= 1e6) return (freq / 1e6).toFixed(3) + ' MHz'
  if (freq >= 1e3) return (freq / 1e3).toFixed(3) + ' kHz'
  return freq.toFixed(0) + ' Hz'
}

export const formatLevel = (level) => {
  return level.toFixed(2) + ' dBm'
}

let generatorTime = 0
let generatorFrameCount = 0
let noiseVariation = 0
let lastNoiseUpdate = 0

const signals = {
  cwSignals: [
    { freqOffset: 0.1, bandwidth: 0.002, level: -20, driftRate: 0.0001, driftPhase: 0 },
    { freqOffset: 0.25, bandwidth: 0.001, level: -35, driftRate: 0, driftPhase: 0 }
  ],
  modulatedSignals: [
    { freqOffset: 0.5, bandwidth: 0.05, level: -30, modulationType: 'am', modulationDepth: 0.3, modulationFreq: 0.2 },
    { freqOffset: 0.7, bandwidth: 0.08, level: -25, modulationType: 'fm', modulationDepth: 0.5, modulationFreq: 0.1 }
  ],
  pulseSignals: [
    { freqOffset: 0.85, bandwidth: 0.01, level: -15, pulsePeriod: 50, pulseWidth: 10, pulsePhase: 0 }
  ]
}

export const generateSpectrumData = (points, minLevel, maxLevel, centerFreq, span) => {
  const data = new Float32Array(points)
  if (points < 1) points = 1
  
  generatorFrameCount++
  if (generatorFrameCount - lastNoiseUpdate > 10) {
    noiseVariation = (Math.random() - 0.5) * 2
    lastNoiseUpdate = generatorFrameCount
  }
  
  const baseNoiseFloor = minLevel + 15
  
  for (let i = 0; i < points; i++) {
    const freqRatio = i / (points - 1)
    
    let value = baseNoiseFloor + noiseVariation + (Math.random() - 0.5) * 3
    
    value += Math.sin(generatorTime * 0.01 + freqRatio * 10) * 2
    
    if (Math.random() < 0.001) {
      value += (Math.random() - 0.5) * 20
    }
    
    signals.cwSignals.forEach(sig => {
      const driftedOffset = sig.freqOffset + Math.sin(generatorTime * sig.driftRate + sig.driftPhase) * 0.005
      const dist = Math.abs(freqRatio - driftedOffset)
      
      if (dist < sig.bandwidth * 3) {
        const gaussian = Math.exp(-(dist * dist) / (sig.bandwidth * sig.bandwidth * 0.5))
        const signalLevel = sig.level
        value = Math.max(value, signalLevel * gaussian + value * (1 - gaussian))
      }
    })
    
    signals.modulatedSignals.forEach(sig => {
      const dist = Math.abs(freqRatio - sig.freqOffset)
      
      if (dist < sig.bandwidth) {
        let modulationEffect
        
        if (sig.modulationType === 'am') {
          modulationEffect = 1 + Math.sin(generatorTime * sig.modulationFreq) * sig.modulationDepth
        } else if (sig.modulationType === 'fm') {
          const freqDeviation = Math.sin(generatorTime * sig.modulationFreq) * sig.modulationDepth * sig.bandwidth
          const effectiveDist = Math.abs(freqRatio - sig.freqOffset - freqDeviation)
          modulationEffect = Math.exp(-(effectiveDist * effectiveDist) / (sig.bandwidth * sig.bandwidth * 0.25))
        } else {
          modulationEffect = 1
        }
        
        const envelope = Math.max(0, 1 - dist / sig.bandwidth)
        
        if (sig.modulationType === 'fm') {
          value = Math.max(value, sig.level + envelope * 5)
        } else {
          value += (sig.level - value) * envelope * modulationEffect
        }
      }
    })
    
    signals.pulseSignals.forEach(sig => {
      const pulsePhase = (generatorFrameCount + sig.pulsePhase) % sig.pulsePeriod
      const isPulseActive = pulsePhase < sig.pulseWidth
      
      if (isPulseActive) {
        const dist = Math.abs(freqRatio - sig.freqOffset)
        
        if (dist < sig.bandwidth * 2) {
          const gaussian = Math.exp(-(dist * dist) / (sig.bandwidth * sig.bandwidth * 0.5))
          const pulseEnvelope = 1 - (pulsePhase / sig.pulseWidth) * 0.3
          value = Math.max(value, sig.level * gaussian * pulseEnvelope)
        }
      }
    })
    
    const edgeAttenuation = Math.sin(freqRatio * Math.PI)
    const rolloff = Math.pow(edgeAttenuation, 0.3)
    const centerBoost = Math.exp(-Math.pow((freqRatio - 0.5) * 4, 2)) * 2
    
    value = minLevel + (value - minLevel) * rolloff + centerBoost
    
    data[i] = Math.max(minLevel, Math.min(maxLevel, value))
  }
  
  generatorTime += 0.05
  
  return data
}

export const calcSpectrumStats = (data) => {
  if (!data || data.length === 0) {
    return { max: 0, min: 0, avg: 0, maxIndex: 0, minIndex: 0 }
  }
  
  let max = -Infinity
  let min = Infinity
  let sum = 0
  let maxIndex = 0
  let minIndex = 0
  
  for (let i = 0; i < data.length; i++) {
    const val = data[i]
    if (val > max) {
      max = val
      maxIndex = i
    }
    if (val < min) {
      min = val
      minIndex = i
    }
    sum += val
  }
  
  return {
    max,
    min,
    avg: sum / data.length,
    maxIndex,
    minIndex
  }
}
