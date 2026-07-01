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
  waterfallEnabled: true,
  waterfallHeight: 200,
  useWebGL: false,
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

export const generateSpectrumData = (points, minLevel, maxLevel, centerFreq, span) => {
  const data = new Float32Array(points)
  const noiseFloor = minLevel + Math.random() * 10
  
  for (let i = 0; i < points; i++) {
    let value = noiseFloor + (Math.random() - 0.5) * 5
    
    const freqRatio = i / (points - 1)
    const distFromCenter = Math.abs(freqRatio - 0.5)
    
    value += Math.sin(freqRatio * Math.PI * 4) * 3
    value += Math.sin(freqRatio * Math.PI * 8 + 1) * 2
    
    if (distFromCenter < 0.1) {
      const peakFactor = 1 - (distFromCenter / 0.1)
      value += peakFactor * (maxLevel - minLevel) * 0.6
    }
    
    const peakPos1 = 0.3
    if (Math.abs(freqRatio - peakPos1) < 0.05) {
      const peakFactor = 1 - (Math.abs(freqRatio - peakPos1) / 0.05)
      value += peakFactor * (maxLevel - minLevel) * 0.4
    }
    
    const peakPos2 = 0.7
    if (Math.abs(freqRatio - peakPos2) < 0.03) {
      const peakFactor = 1 - (Math.abs(freqRatio - peakPos2) / 0.03)
      value += peakFactor * (maxLevel - minLevel) * 0.5
    }
    
    data[i] = Math.max(minLevel, Math.min(maxLevel, value))
  }
  
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
