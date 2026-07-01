self.onmessage = function(e) {
  const { type, data } = e.data
  
  switch (type) {
    case 'sample':
      sample(data)
      break
  }
}

function sample({ spectrum, targetWidth, zoomX }) {
  if (!spectrum || spectrum.length === 0 || targetWidth <= 0) {
    self.postMessage({ type: 'sampled', data: { sampled: new Float32Array() } })
    return
  }
  
  const zoomStart = zoomX ? zoomX[0] : 0
  const zoomEnd = zoomX ? zoomX[1] : 1
  
  const z0 = Math.max(0, Math.min(1, zoomStart))
  const z1 = Math.max(0, Math.min(1, zoomEnd))
  const startIdx = Math.floor(Math.min(z0, z1) * spectrum.length)
  const endIdx = Math.ceil(Math.max(z0, z1) * spectrum.length)
  const visibleData = spectrum.slice(Math.max(0, startIdx), Math.min(spectrum.length, endIdx))
  
  if (visibleData.length <= 0) {
    self.postMessage({ type: 'sampled', data: { sampled: new Float32Array() } })
    return
  }
  
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
  
  self.postMessage({ type: 'sampled', data: { sampled } })
}
