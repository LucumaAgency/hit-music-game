import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const LANES = [
  { key: 'a', color: '#22c55e' }, // verde
  { key: 's', color: '#ef4444' }, // rojo
  { key: 'j', color: '#eab308' }, // amarillo
  { key: 'k', color: '#3b82f6' }, // azul
  { key: 'l', color: '#f97316' }, // naranja
]

const NOTE_SPEED = 3 // segundos que tarda una nota en caer
const HIT_WINDOW = 0.15 // ventana de tiempo para hit (segundos)

// Generador de números pseudoaleatorios con seed (determinístico)
function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

function analyzeAudio(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const notes = []

  // Parámetros para detección de picos
  const windowSize = Math.floor(sampleRate * 0.05) // 50ms windows
  const threshold = 0.3
  const minTimeBetweenNotes = 0.1 // mínimo 100ms entre notas

  let lastNoteTime = -1
  let noteIndex = 0

  // Analizar en ventanas
  for (let i = 0; i < channelData.length; i += windowSize) {
    const windowEnd = Math.min(i + windowSize, channelData.length)
    let sum = 0
    let max = 0

    // Calcular energía de la ventana
    for (let j = i; j < windowEnd; j++) {
      const val = Math.abs(channelData[j])
      sum += val * val
      if (val > max) max = val
    }

    const energy = Math.sqrt(sum / (windowEnd - i))
    const time = i / sampleRate

    // Detectar pico
    if (energy > threshold && max > 0.4) {
      if (time - lastNoteTime >= minTimeBetweenNotes) {
        // Usar seed basado en el tiempo para consistencia
        const lane = Math.floor(seededRandom(time * 1000 + noteIndex) * 5)
        notes.push({ time: Math.round(time * 1000) / 1000, lane })
        lastNoteTime = time
        noteIndex++
      }
    }
  }

  // Para dificultad alta, agregar más notas en momentos de alta energía
  const extraNotes = []
  for (let i = 0; i < notes.length - 1; i++) {
    const gap = notes[i + 1].time - notes[i].time
    // Usar seed determinístico para decidir si agregar nota
    if (gap > 0.3 && seededRandom(notes[i].time * 777) > 0.5) {
      const midTime = Math.round((notes[i].time + gap / 2) * 1000) / 1000
      let lane = Math.floor(seededRandom(midTime * 999) * 5)
      // Evitar mismo carril que nota anterior
      if (lane === notes[i].lane) {
        lane = (lane + 1) % 5
      }
      extraNotes.push({ time: midTime, lane })
    }
  }

  return [...notes, ...extraNotes].sort((a, b) => a.time - b.time)
}

// Descargar JSON
function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [gameState, setGameState] = useState('idle') // idle, analyzing, playing, finished
  const [notes, setNotes] = useState([])
  const [activeNotes, setActiveNotes] = useState([])
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [feedback, setFeedback] = useState({})
  const [pressedKeys, setPressedKeys] = useState({})
  const [maxCombo, setMaxCombo] = useState(0)

  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const animationRef = useRef(null)
  const notesRef = useRef([])
  const [loadedFromJson, setLoadedFromJson] = useState(false)

  // Cargar notas (primero intenta JSON, luego analiza MP3)
  const loadAudio = async () => {
    setGameState('analyzing')

    try {
      // Primero intentar cargar el JSON existente
      const jsonResponse = await fetch('/song.json')
      if (jsonResponse.ok) {
        const songData = await jsonResponse.json()
        const loadedNotes = songData.notes || songData
        setNotes(loadedNotes)
        notesRef.current = loadedNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))
        setLoadedFromJson(true)
        setGameState('ready')
        console.log('Notas cargadas desde song.json')
        return
      }
    } catch (e) {
      console.log('No se encontro song.json, analizando MP3...')
    }

    // Si no hay JSON, analizar el MP3
    try {
      const response = await fetch('/song.mp3')
      const arrayBuffer = await response.arrayBuffer()

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)

      // Analizar y generar notas
      const generatedNotes = analyzeAudio(audioBuffer)
      setNotes(generatedNotes)
      notesRef.current = generatedNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))

      // Descargar JSON automáticamente
      const songData = {
        song: {
          title: "Bullet for My Valentine - Tears Don't Fall",
          audioFile: "song.mp3"
        },
        notes: generatedNotes
      }
      downloadJSON(songData, 'song.json')

      setLoadedFromJson(false)
      setGameState('ready')
      console.log(`Generadas ${generatedNotes.length} notas. JSON descargado.`)
    } catch (error) {
      console.error('Error loading audio:', error)
      setGameState('idle')
    }
  }

  // Iniciar juego
  const startGame = () => {
    if (gameState !== 'ready' && gameState !== 'finished') return

    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setHits(0)
    setMisses(0)
    setActiveNotes([])
    setFeedback({})
    notesRef.current = notesRef.current.map(n => ({ ...n, hit: false, missed: false }))

    audioRef.current.currentTime = 0
    audioRef.current.play()
    setGameState('playing')
  }

  // Game loop
  const gameLoop = useCallback(() => {
    if (!audioRef.current) return

    const currentTime = audioRef.current.currentTime

    // Actualizar notas activas (las que están en pantalla)
    const visibleNotes = notesRef.current.filter(note => {
      const noteScreenTime = note.time - currentTime
      return noteScreenTime <= NOTE_SPEED && noteScreenTime >= -0.5 && !note.hit
    })

    // Marcar notas perdidas
    notesRef.current.forEach(note => {
      if (!note.hit && !note.missed && currentTime > note.time + HIT_WINDOW) {
        note.missed = true
        setMisses(m => m + 1)
        setCombo(0)
        setFeedback(prev => ({ ...prev, [note.lane]: { type: 'miss', time: Date.now() } }))
      }
    })

    setActiveNotes([...visibleNotes])

    // Verificar si terminó la canción
    if (audioRef.current.ended) {
      setGameState('finished')
      return
    }

    animationRef.current = requestAnimationFrame(gameLoop)
  }, [])

  useEffect(() => {
    if (gameState === 'playing') {
      animationRef.current = requestAnimationFrame(gameLoop)
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [gameState, gameLoop])

  // Actualizar max combo
  useEffect(() => {
    if (combo > maxCombo) {
      setMaxCombo(combo)
    }
  }, [combo, maxCombo])

  // Manejar teclas
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase()
      const laneIndex = LANES.findIndex(l => l.key === key)

      if (laneIndex === -1) return
      if (e.repeat) return // Ignorar key repeat

      setPressedKeys(prev => ({ ...prev, [key]: true }))

      if (gameState !== 'playing') return

      const currentTime = audioRef.current?.currentTime || 0

      // Buscar nota en el carril presionado dentro de la ventana de hit
      const hitNote = notesRef.current.find(note =>
        note.lane === laneIndex &&
        !note.hit &&
        !note.missed &&
        Math.abs(note.time - currentTime) <= HIT_WINDOW
      )

      if (hitNote) {
        hitNote.hit = true
        setHits(h => h + 1)
        setCombo(c => {
          const newCombo = c + 1
          return newCombo
        })
        setScore(s => s + 100 * (1 + Math.floor((combo + 1) / 10)))
        setFeedback(prev => ({ ...prev, [laneIndex]: { type: 'hit', time: Date.now() } }))
      }
    }

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase()
      setPressedKeys(prev => ({ ...prev, [key]: false }))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, combo])

  const currentTime = audioRef.current?.currentTime || 0

  return (
    <div className="app">
      <audio ref={audioRef} src="/song.mp3" />

      <div className="header">
        <h1>Guitar Flash Clone</h1>
        <div className="stats">
          <span>Score: {score}</span>
          <span>Combo: {combo}x</span>
          <span>Hits: {hits}</span>
          <span>Miss: {misses}</span>
        </div>
      </div>

      {gameState === 'idle' && (
        <div className="menu">
          <h2>Bullet for My Valentine - Tears Don't Fall</h2>
          <button onClick={loadAudio}>Cargar Cancion</button>
          <p className="instructions">Teclas: A S J K L</p>
        </div>
      )}

      {gameState === 'analyzing' && (
        <div className="menu">
          <h2>Analizando audio...</h2>
          <div className="loader"></div>
        </div>
      )}

      {gameState === 'ready' && (
        <div className="menu">
          <h2>Listo!</h2>
          <p>{notes.length} notas {loadedFromJson ? 'cargadas desde JSON' : 'generadas'}</p>
          {!loadedFromJson && (
            <p className="json-hint">
              JSON descargado! Muevelo a public/song.json para guardarlo
            </p>
          )}
          <button onClick={startGame}>Jugar!</button>
        </div>
      )}

      {gameState === 'finished' && (
        <div className="menu results">
          <h2>Cancion Terminada!</h2>
          <div className="final-stats">
            <p>Score Final: <strong>{score}</strong></p>
            <p>Hits: {hits} / {notes.length}</p>
            <p>Precision: {notes.length > 0 ? Math.round((hits / notes.length) * 100) : 0}%</p>
            <p>Max Combo: {maxCombo}x</p>
          </div>
          <button onClick={startGame}>Jugar de Nuevo</button>
        </div>
      )}

      {(gameState === 'playing' || gameState === 'finished') && (
        <div className="game-area">
          {LANES.map((lane, laneIndex) => (
            <div key={laneIndex} className="lane">
              {/* Notas cayendo */}
              {activeNotes
                .filter(note => note.lane === laneIndex)
                .map(note => {
                  const noteScreenTime = note.time - currentTime
                  const progress = 1 - (noteScreenTime / NOTE_SPEED)
                  const top = progress * 85

                  return (
                    <div
                      key={note.id}
                      className="note"
                      style={{
                        top: `${top}%`,
                        backgroundColor: lane.color,
                        boxShadow: `0 0 15px ${lane.color}`,
                        opacity: note.hit ? 0 : 1,
                      }}
                    />
                  )
                })}

              {/* Zona de hit */}
              <div
                className={`hit-zone ${pressedKeys[lane.key] ? 'pressed' : ''}`}
                style={{
                  borderColor: lane.color,
                  backgroundColor: pressedKeys[lane.key] ? lane.color : 'transparent',
                  boxShadow: pressedKeys[lane.key] ? `0 0 30px ${lane.color}` : 'none'
                }}
              >
                <span className="key-label">{lane.key.toUpperCase()}</span>
              </div>

              {/* Feedback */}
              {feedback[laneIndex] && Date.now() - feedback[laneIndex].time < 300 && (
                <div className={`feedback ${feedback[laneIndex].type}`}>
                  {feedback[laneIndex].type === 'hit' ? 'HIT!' : 'MISS'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
