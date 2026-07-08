let spectrumData = null
let maxHoldData = null
let minHoldData = null
let avgData = null
let avgCount = 0
let waterfallData = []
let waterfallMaxLines = 200
let minLevel = -100
let maxLevel = 0
let isRecording = false
let recordedData = []

self.onmessage = function(e) {
  const { type, data, config } = e.data

  switch (type) {
    case 'init':
      init(config)
      break
    case 'processSpectrum':
      processSpectrum(data)
      break
    case 'updateConfig':
      updateConfig(config)
      break
    case 'resetMaxHold':
      resetMaxHold()
      break
    case 'resetMinHold':
      resetMinHold()
      break
    case 'resetAvg':
      resetAvg()
      break
    case 'clearWaterfall':
      clearWaterfall()
      break
    case 'startRecording':
      startRecording()
      break
    case 'stopRecording':
      stopRecording()
      break
    case 'getRecordedData':
      getRecordedData()
      break
    case 'calcStats':
      calcStats(data)
      break
    case 'boxSelectWaterfall':
      boxSelectWaterfall(data)
      break
    default:
      break
  }
}

function init(config) {
  const points = Math.floor(config.span / config.freqResolution)
  spectrumData = new Float32Array(points)
  maxHoldData = new Float32Array(points)
  minHoldData = new Float32Array(points)
  avgData = new Float32Array(points)
  waterfallMaxLines = config.waterfallMaxLines || 200
  minLevel = config.minLevel || -100
  maxLevel = config.maxLevel || 0
  
  for (let i = 0; i < points; i++) {
    maxHoldData[i] = minLevel
    minHoldData[i] = maxLevel
    avgData[i] = 0
  }
  
  waterfallData = []
  avgCount = 0
  recordedData = []
  
  self.postMessage({ type: 'initComplete' })
}

function processSpectrum(data) {
  const newData = new Float32Array(data)
  
  for (let i = 0; i < newData.length; i++) {
    if (newData[i] > maxHoldData[i]) {
      maxHoldData[i] = newData[i]
    }
    if (newData[i] < minHoldData[i]) {
      minHoldData[i] = newData[i]
    }
  }
  
  avgCount++
  for (let i = 0; i < newData.length; i++) {
    avgData[i] = avgData[i] + (newData[i] - avgData[i]) / avgCount
  }
  
  waterfallData.unshift(new Float32Array(newData))
  if (waterfallData.length > waterfallMaxLines) {
    waterfallData.pop()
  }
  
  if (isRecording) {
    recordedData.push({
      timestamp: Date.now(),
      data: new Float32Array(newData)
    })
  }
  
  spectrumData = newData
  
  const stats = calculateStats(newData)
  
  self.postMessage({
    type: 'spectrumProcessed',
    data: {
      spectrum: new Float32Array(newData),
      maxHold: new Float32Array(maxHoldData),
      minHold: new Float32Array(minHoldData),
      avg: new Float32Array(avgData),
      waterfall: waterfallData.map(line => new Float32Array(line)),
      stats,
      waterfallLines: waterfallData.length
    }
  })
}

function updateConfig(config) {
  if (config.waterfallMaxLines !== undefined) {
    waterfallMaxLines = config.waterfallMaxLines
    while (waterfallData.length > waterfallMaxLines) {
      waterfallData.pop()
    }
  }
  if (config.minLevel !== undefined) minLevel = config.minLevel
  if (config.maxLevel !== undefined) maxLevel = config.maxLevel
  
  self.postMessage({ type: 'configUpdated' })
}

function resetMaxHold() {
  if (spectrumData) {
    for (let i = 0; i < spectrumData.length; i++) {
      maxHoldData[i] = minLevel
    }
  }
  self.postMessage({ type: 'maxHoldReset' })
}

function resetMinHold() {
  if (spectrumData) {
    for (let i = 0; i < spectrumData.length; i++) {
      minHoldData[i] = maxLevel
    }
  }
  self.postMessage({ type: 'minHoldReset' })
}

function resetAvg() {
  if (spectrumData) {
    for (let i = 0; i < spectrumData.length; i++) {
      avgData[i] = 0
    }
  }
  avgCount = 0
  self.postMessage({ type: 'avgReset' })
}

function clearWaterfall() {
  waterfallData = []
  self.postMessage({ type: 'waterfallCleared' })
}

function startRecording() {
  isRecording = true
  recordedData = []
  self.postMessage({ type: 'recordingStarted' })
}

function stopRecording() {
  isRecording = false
  self.postMessage({ 
    type: 'recordingStopped',
    data: {
      frames: recordedData.length,
      duration: recordedData.length > 0 ? 
        (recordedData[recordedData.length - 1].timestamp - recordedData[0].timestamp) / 1000 : 0
    }
  })
}

function getRecordedData() {
  self.postMessage({
    type: 'recordedData',
    data: recordedData
  })
}

function calcStats(data) {
  const arr = new Float32Array(data)
  const stats = calculateStats(arr)
  self.postMessage({ type: 'statsCalculated', data: stats })
}

function boxSelectWaterfall(data) {
  const { startX, endX, startY, endY } = data
  const selected = []
  
  const yStart = Math.max(0, Math.min(startY, endY))
  const yEnd = Math.min(waterfallData.length - 1, Math.max(startY, endY))
  const xStart = Math.max(0, Math.min(startX, endX))
  const xEnd = Math.min((waterfallData[0]?.length || 1) - 1, Math.max(startX, endX))
  
  for (let y = yStart; y <= yEnd; y++) {
    if (waterfallData[y]) {
      const lineData = waterfallData[y].slice(xStart, xEnd + 1)
      selected.push({
        index: y,
        data: lineData,
        stats: calculateStats(lineData)
      })
    }
  }
  
  self.postMessage({
    type: 'boxSelectResult',
    data: {
      selected,
      bounds: { xStart, xEnd, yStart, yEnd },
      overallStats: selected.length > 0 ? calculateOverallStats(selected) : null
    }
  })
}

function calculateStats(arr) {
  if (!arr || arr.length === 0) {
    return { max: 0, min: 0, avg: 0, maxIndex: 0, minIndex: 0 }
  }
  
  let max = -Infinity
  let min = Infinity
  let sum = 0
  let maxIndex = 0
  let minIndex = 0
  
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i]
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
    avg: sum / arr.length,
    maxIndex,
    minIndex
  }
}

function calculateOverallStats(selected) {
  let max = -Infinity
  let min = Infinity
  let sum = 0
  let count = 0
  
  selected.forEach(line => {
    if (line.stats.max > max) max = line.stats.max
    if (line.stats.min < min) min = line.stats.min
    sum += line.stats.avg * line.data.length
    count += line.data.length
  })
  
  return {
    max,
    min,
    avg: count > 0 ? sum / count : 0,
    lineCount: selected.length,
    pointCount: count
  }
}
