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
  }
}

function updateHold({ spectrum, maxHold, minHold, avgHold }) {
  if (!spectrum || spectrum.length === 0) return
  
  if (!maxHoldData || maxHoldData.length !== spectrum.length) {
    maxHoldData = new Float32Array(spectrum)
    minHoldData = new Float32Array(spectrum)
    avgData = new Float32Array(spectrum)
    avgCount = 1
    return
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
    const alpha = 1 / avgCount
    for (let i = 0; i < spectrum.length; i++) {
      avgData[i] = avgData[i] * (1 - alpha) + spectrum[i] * alpha
    }
  }
  
  self.postMessage({
    type: 'holdLines',
    data: {
      maxHold: maxHold ? maxHoldData : null,
      minHold: minHold ? minHoldData : null,
      avg: avgHold ? avgData : null
    }
  })
}

function reset() {
  maxHoldData = null
  minHoldData = null
  avgData = null
  avgCount = 0
}
