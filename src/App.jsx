import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const LANES = [
  { key: 'a', color: '#22c55e' },
  { key: 's', color: '#ef4444' },
  { key: 'j', color: '#eab308' },
  { key: 'k', color: '#3b82f6' },
  { key: 'l', color: '#f97316' },
]

const NOTE_SPEED = 3
const HIT_WINDOW = 0.15
const MIN_TIME_BETWEEN_NOTES = 0.25

function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

function analyzeAudio(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const notes = []
  const windowSize = Math.floor(sampleRate * 0.05)
  const threshold = 0.3
  const minTimeBetweenNotes = MIN_TIME_BETWEEN_NOTES

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

    if (energy > threshold && max > 0.4) {
      if (time - lastNoteTime >= minTimeBetweenNotes) {
        const lane = Math.floor(seededRandom(time * 1000 + noteIndex) * 5)
        notes.push({ time: Math.round(time * 1000) / 1000, lane })
        lastNoteTime = time
        noteIndex++
      }
    }
  }

  const extraNotes = []
  for (let i = 0; i < notes.length - 1; i++) {
    const gap = notes[i + 1].time - notes[i].time
    if (gap > 0.3 && seededRandom(notes[i].time * 777) > 0.5) {
      const midTime = Math.round((notes[i].time + gap / 2) * 1000) / 1000
      let lane = Math.floor(seededRandom(midTime * 999) * 5)
      if (lane === notes[i].lane) {
        lane = (lane + 1) % 5
      }
      extraNotes.push({ time: midTime, lane })
    }
  }

  return [...notes, ...extraNotes].sort((a, b) => a.time - b.time)
}

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
  const [gameState, setGameState] = useState('idle')
  const [songs, setSongs] = useState([])
  const [selectedSong, setSelectedSong] = useState(null)
  const [customAudioUrl, setCustomAudioUrl] = useState(null)
  const fileInputRef = useRef(null)
  const [notes, setNotes] = useState([])
  const [activeNotes, setActiveNotes] = useState([])
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [feedback, setFeedback] = useState({})
  const [pressedKeys, setPressedKeys] = useState({})
  const [maxCombo, setMaxCombo] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [volume, setVolume] = useState(0.5)
  const [loadedFromJson, setLoadedFromJson] = useState(false)

  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const animationRef = useRef(null)
  const notesRef = useRef([])

  // Cargar lista de canciones al inicio
  useEffect(() => {
    fetch('/songs/index.json')
      .then(res => res.json())
      .then(data => setSongs(data.songs || []))
      .catch(() => console.log('No se encontró index.json'))
  }, [])

  // Manejar subida de MP3
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Crear URL temporal para el archivo
    const audioUrl = URL.createObjectURL(file)
    setCustomAudioUrl(audioUrl)

    const fileName = file.name.replace('.mp3', '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
    setSelectedSong({
      id: 'custom',
      title: fileName,
      artist: 'Archivo Local',
      audio: audioUrl,
      notes: null
    })

    setGameState('analyzing')

    // Actualizar src del audio
    if (audioRef.current) {
      audioRef.current.src = audioUrl
    }

    // Analizar el audio
    try {
      const arrayBuffer = await file.arrayBuffer()
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)

      const generatedNotes = analyzeAudio(audioBuffer)
      setNotes(generatedNotes)
      notesRef.current = generatedNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))

      // Guardar en el servidor
      const songData = {
        song: { title: fileName, artist: 'Custom', audioFile: file.name },
        notes: generatedNotes
      }

      const formData = new FormData()
      formData.append('audio', file)
      formData.append('title', fileName)
      formData.append('artist', 'Custom')
      formData.append('notes', JSON.stringify(songData))

      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })
        if (response.ok) {
          console.log('Canción guardada en el servidor')
          // Recargar lista de canciones
          const songsRes = await fetch('/songs/index.json')
          if (songsRes.ok) {
            const data = await songsRes.json()
            setSongs(data.songs || [])
          }
        }
      } catch (uploadError) {
        console.log('No se pudo guardar en servidor, modo offline')
        // Descargar JSON como fallback
        downloadJSON(songData, `${fileName}.json`)
      }

      setLoadedFromJson(false)
      setGameState('ready')
    } catch (error) {
      console.error('Error analizando audio:', error)
      setGameState('idle')
    }
  }

  // Cargar canción seleccionada
  const loadSong = async (song) => {
    setSelectedSong(song)
    setGameState('analyzing')

    const audioPath = `/songs/${song.audio}`
    const notesPath = `/songs/${song.notes}`

    // Actualizar src del audio
    if (audioRef.current) {
      audioRef.current.src = audioPath
    }

    // Intentar cargar notas del JSON
    try {
      const jsonResponse = await fetch(notesPath)
      if (jsonResponse.ok) {
        const songData = await jsonResponse.json()
        const loadedNotes = songData.notes || songData
        setNotes(loadedNotes)
        notesRef.current = loadedNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))
        setLoadedFromJson(true)
        setGameState('ready')
        return
      }
    } catch (e) {
      console.log('No se encontró JSON, analizando audio...')
    }

    // Si no hay JSON, analizar el audio
    try {
      const response = await fetch(audioPath)
      const arrayBuffer = await response.arrayBuffer()

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)

      const generatedNotes = analyzeAudio(audioBuffer)
      setNotes(generatedNotes)
      notesRef.current = generatedNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))

      // Descargar JSON
      const songData = {
        song: { title: song.title, artist: song.artist, audioFile: song.audio },
        notes: generatedNotes
      }
      downloadJSON(songData, song.notes)

      setLoadedFromJson(false)
      setGameState('ready')
    } catch (error) {
      console.error('Error cargando audio:', error)
      setGameState('idle')
    }
  }

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
    audioRef.current.volume = volume
    audioRef.current.play()
    setIsPaused(false)
    setGameState('playing')
  }

  const togglePause = useCallback(() => {
    if (gameState !== 'playing' && gameState !== 'paused') return

    if (isPaused) {
      audioRef.current.play()
      setIsPaused(false)
      setGameState('playing')
    } else {
      audioRef.current.pause()
      setIsPaused(true)
      setGameState('paused')
    }
  }, [gameState, isPaused])

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const backToMenu = async () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    // Limpiar URL temporal si existe
    if (customAudioUrl) {
      URL.revokeObjectURL(customAudioUrl)
      setCustomAudioUrl(null)
    }
    setSelectedSong(null)
    setGameState('idle')
    setNotes([])
    setActiveNotes([])

    // Recargar lista de canciones
    try {
      const res = await fetch('/songs/index.json')
      if (res.ok) {
        const data = await res.json()
        setSongs(data.songs || [])
      }
    } catch (e) {
      console.log('Error recargando canciones')
    }
  }

  const gameLoop = useCallback(() => {
    if (!audioRef.current) return

    const currentTime = audioRef.current.currentTime

    const visibleNotes = notesRef.current.filter(note => {
      const noteScreenTime = note.time - currentTime
      return noteScreenTime <= NOTE_SPEED && noteScreenTime >= -0.5 && !note.hit
    })

    notesRef.current.forEach(note => {
      if (!note.hit && !note.missed && currentTime > note.time + HIT_WINDOW) {
        note.missed = true
        setMisses(m => m + 1)
        setCombo(0)
        setFeedback(prev => ({ ...prev, [note.lane]: { type: 'miss', time: Date.now() } }))
      }
    })

    setActiveNotes([...visibleNotes])

    if (audioRef.current.ended) {
      setGameState('finished')
      return
    }

    animationRef.current = requestAnimationFrame(gameLoop)
  }, [])

  useEffect(() => {
    if (gameState === 'playing' && !isPaused) {
      animationRef.current = requestAnimationFrame(gameLoop)
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [gameState, gameLoop, isPaused])

  useEffect(() => {
    if (combo > maxCombo) {
      setMaxCombo(combo)
    }
  }, [combo, maxCombo])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase()

      if (key === 'p') {
        togglePause()
        return
      }

      if (key === 'escape') {
        backToMenu()
        return
      }

      const laneIndex = LANES.findIndex(l => l.key === key)

      if (laneIndex === -1) return
      if (e.repeat) return

      setPressedKeys(prev => ({ ...prev, [key]: true }))

      if (gameState !== 'playing' || isPaused) return

      const currentTime = audioRef.current?.currentTime || 0

      const hitNote = notesRef.current.find(note =>
        note.lane === laneIndex &&
        !note.hit &&
        !note.missed &&
        Math.abs(note.time - currentTime) <= HIT_WINDOW
      )

      if (hitNote) {
        hitNote.hit = true
        setHits(h => h + 1)
        setCombo(c => c + 1)
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
  }, [gameState, combo, togglePause, isPaused])

  const currentTime = audioRef.current?.currentTime || 0

  return (
    <div className="app">
      <audio ref={audioRef} />

      <div className="header">
        <h1>Guitar Flash Clone</h1>
        <div className="stats">
          <span>Score: {score}</span>
          <span>Combo: {combo}x</span>
          <span>Hits: {hits}</span>
          <span>Miss: {misses}</span>
        </div>
        <div className="controls">
          <label className="volume-control">
            Vol
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
            />
          </label>
          <span className="pause-hint">P = Pausa | ESC = Menu</span>
        </div>
      </div>

      {gameState === 'idle' && !selectedSong && (
        <div className="menu">
          <h2>Selecciona una Cancion</h2>
          <div className="song-list">
            {songs.map(song => (
              <button
                key={song.id}
                className="song-button"
                onClick={() => loadSong(song)}
              >
                <span className="song-title">{song.title}</span>
                <span className="song-artist">{song.artist}</span>
              </button>
            ))}
          </div>

          <div className="upload-divider">
            <span>o sube tu propio MP3</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept=".mp3,audio/mpeg"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Subir MP3
          </button>

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
          <p className="song-info">{selectedSong?.title} - {selectedSong?.artist}</p>
          <p>{notes.length} notas {loadedFromJson ? 'cargadas' : 'generadas'}</p>
          {!loadedFromJson && (
            <p className="json-hint">
              JSON descargado! Muevelo a public/songs/ para guardarlo
            </p>
          )}
          <button onClick={startGame}>Jugar!</button>
          <button className="back-button" onClick={backToMenu}>Volver</button>
        </div>
      )}

      {gameState === 'paused' && (
        <div className="menu pause-menu">
          <h2>PAUSA</h2>
          <p>Presiona P para continuar</p>
          <button onClick={togglePause}>Continuar</button>
          <button className="back-button" onClick={backToMenu}>Salir al Menu</button>
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
          <button className="back-button" onClick={backToMenu}>Volver al Menu</button>
        </div>
      )}

      {(gameState === 'playing' || gameState === 'finished' || gameState === 'paused') && (
        <div className="game-area">
          {LANES.map((lane, laneIndex) => (
            <div key={laneIndex} className="lane">
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
