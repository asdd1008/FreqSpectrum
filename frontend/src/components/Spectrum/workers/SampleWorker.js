self.onmessage = function(e) {
  const { type, data } = e.data
  
  switch (type) {
    case 'sample':
      sample(data)
      break
  }
}

function sample({ spectrum, targetWidth, zoomX }) {
  if (!spectrum || spectrum.length === 0) {
    self.postMessage({ type: 'sampled', data: { sampled: new Float32Array() } })
    return
  }
  
  const zoomStart = zoomX ? zoomX[0] : 0
  const zoomEnd = zoomX ? zoomX[1] : 1
  
  const startIdx = Math.floor(zoomStart * spectrum.length)
  const endIdx = Math.ceil(zoomEnd * spectrum.length)
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
  
  self.postMessage({ type: 'sampled', data: { sampled } })
}
