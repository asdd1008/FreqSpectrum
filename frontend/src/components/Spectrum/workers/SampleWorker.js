self.onmessage = function(e) {
  const { type, data } = e.data
  
  switch (type) {
    case 'sample':
      sampleData(data)
      break
    default:
      break
  }
}

function sampleData(data) {
  const { spectrum, targetWidth, zoomX } = data
  
  if (!spectrum || spectrum.length === 0) {
    self.postMessage({ type: 'sampled', data: { sampled: new Float32Array(0) } })
    return
  }
  
  if (!targetWidth || targetWidth <= 0) {
    self.postMessage({ type: 'sampled', data: { sampled: new Float32Array(spectrum) } })
    return
  }
  
  const z0 = zoomX ? zoomX[0] : 0
  const z1 = zoomX ? zoomX[1] : 1
  
  const startIdx = Math.floor(z0 * spectrum.length)
  const endIdx = Math.ceil(z1 * spectrum.length)
  const visibleData = spectrum.slice(startIdx, endIdx)
  
  if (visibleData.length <= targetWidth) {
    self.postMessage({ 
      type: 'sampled', 
      data: { sampled: new Float32Array(visibleData) } 
    })
    return
  }
  
  const sampled = new Float32Array(targetWidth)
  const step = visibleData.length / targetWidth
  
  for (let i = 0; i < targetWidth; i++) {
    const start = Math.floor(i * step)
    const end = Math.floor((i + 1) * step)
    let max = -Infinity
    
    for (let j = start; j < end && j < visibleData.length; j++) {
      if (visibleData[j] > max) {
        max = visibleData[j]
      }
    }
    
    sampled[i] = max
  }
  
  self.postMessage({ 
    type: 'sampled', 
    data: { sampled } 
  })
}