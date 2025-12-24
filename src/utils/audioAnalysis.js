export function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

export function detectBPM(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  // Detectar picos de energia
  const windowSize = Math.floor(sampleRate * 0.05)
  const peaks = []

  for (let i = 0; i < channelData.length; i += windowSize) {
    const windowEnd = Math.min(i + windowSize, channelData.length)
    let sum = 0
    let max = 0

    for (let j = i; j < windowEnd; j++) {
      const val = Math.abs(channelData[j])
      sum += val * val
      if (val > max) max = val
    }

    const energy = Math.sqrt(sum / (windowEnd - i))
    const time = i / sampleRate

    if (energy > 0.3 && max > 0.4) {
      peaks.push(time)
    }
  }

  // Calcular intervalos entre picos
  const intervals = []
  for (let i = 1; i < peaks.length; i++) {
    const interval = peaks[i] - peaks[i - 1]
    if (interval > 0.2 && interval < 2) { // Entre 30 y 300 BPM
      intervals.push(interval)
    }
  }

  if (intervals.length === 0) return 120 // Default BPM

  // Encontrar el intervalo mas comun (agrupando en buckets)
  const buckets = {}
  intervals.forEach(interval => {
    const bucket = Math.round(interval * 10) / 10 // Redondear a 0.1s
    buckets[bucket] = (buckets[bucket] || 0) + 1
  })

  let mostCommonInterval = 0.5 // Default 120 BPM
  let maxCount = 0
  Object.entries(buckets).forEach(([interval, count]) => {
    if (count > maxCount) {
      maxCount = count
      mostCommonInterval = parseFloat(interval)
    }
  })

  // Convertir intervalo a BPM
  const bpm = Math.round(60 / mostCommonInterval)

  // Limitar a un rango razonable
  return Math.max(60, Math.min(200, bpm))
}

export function analyzeAudio(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const notes = []
  const windowSize = Math.floor(sampleRate * 0.40) // Escanear cada 400ms
  const threshold = 0.20 // Umbral de energia
  const minTimeBetweenNotes = 0.20

  let lastNoteTime = -1
  let noteIndex = 0

  for (let i = 0; i < channelData.length; i += windowSize) {
    const windowEnd = Math.min(i + windowSize, channelData.length)
    let sum = 0
    let max = 0

    for (let j = i; j < windowEnd; j++) {
      const val = Math.abs(channelData[j])
      sum += val * val
      if (val > max) max = val
    }

    const energy = Math.sqrt(sum / (windowEnd - i))
    const time = i / sampleRate

    if (energy > threshold && max > 0.30) { // Umbral de amplitud
      if (time - lastNoteTime >= minTimeBetweenNotes) {
        const lane = Math.floor(seededRandom(time * 1000 + noteIndex) * 5)
        notes.push({ time: Math.round(time * 1000) / 1000, lane })
        lastNoteTime = time
        noteIndex++
      }
    }
  }

  // Agregar notas extra en huecos grandes (60% probabilidad)
  const extraNotes = []
  for (let i = 0; i < notes.length - 1; i++) {
    const gap = notes[i + 1].time - notes[i].time
    if (gap > 0.25 && seededRandom(notes[i].time * 777) > 0.4) {
      const midTime = Math.round((notes[i].time + gap / 2) * 1000) / 1000
      let lane = Math.floor(seededRandom(midTime * 999) * 5)
      if (lane === notes[i].lane) {
        lane = (lane + 1) % 5
      }
      extraNotes.push({ time: midTime, lane })
    }
  }

  const allNotes = [...notes, ...extraNotes].sort((a, b) => a.time - b.time)

  // Agregar acordes (combinaciones de 2 teclas) - 20% de las notas
  const notesWithChords = []
  for (let i = 0; i < allNotes.length; i++) {
    notesWithChords.push(allNotes[i])

    // 20% probabilidad de agregar una segunda nota al mismo tiempo
    if (seededRandom(allNotes[i].time * 333 + i) > 0.8) {
      let secondLane = Math.floor(seededRandom(allNotes[i].time * 555 + i) * 5)
      // Asegurar que sea diferente carril
      if (secondLane === allNotes[i].lane) {
        secondLane = (secondLane + 1) % 5
      }
      notesWithChords.push({
        time: allNotes[i].time,
        lane: secondLane,
        isChord: true
      })
    }
  }

  return notesWithChords.sort((a, b) => a.time - b.time)
}
