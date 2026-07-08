let maxHoldData = null
let minHoldData = null
let avgData = null
let avgCount = 0

self.onmessage = function(e) {
  const { type, data } = e.data
  
  switch (type) {
    case 'updateHold':
      updateHold(data)
      break
    case 'reset':
      reset()
      break
    default:
      break
  }
}

function updateHold(data) {
  const { spectrum, maxHold, minHold, avgHold } = data
  
  if (!maxHoldData || maxHoldData.length !== spectrum.length) {
    maxHoldData = new Float32Array(spectrum.length)
    minHoldData = new Float32Array(spectrum.length)
    avgData = new Float32Array(spectrum.length)
    avgCount = 0
    
    for (let i = 0; i < spectrum.length; i++) {
      maxHoldData[i] = -Infinity
      minHoldData[i] = Infinity
      avgData[i] = 0
    }
  }
  
  if (maxHold) {
    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] > maxHoldData[i]) {
        maxHoldData[i] = spectrum[i]
      }
    }
  }
  
  if (minHold) {
    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] < minHoldData[i]) {
        minHoldData[i] = spectrum[i]
      }
    }
  }
  
  if (avgHold) {
    avgCount++
    for (let i = 0; i < spectrum.length; i++) {
      avgData[i] = avgData[i] + (spectrum[i] - avgData[i]) / avgCount
    }
  }
  
  self.postMessage({
    type: 'holdLines',
    data: {
      maxHold: maxHold ? new Float32Array(maxHoldData) : null,
      minHold: minHold ? new Float32Array(minHoldData) : null,
      avg: avgHold ? new Float32Array(avgData) : null
    }
  })
}

function reset() {
  maxHoldData = null
  minHoldData = null
  avgData = null
  avgCount = 0
}