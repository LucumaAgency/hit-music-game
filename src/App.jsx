import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const LANES = [
  { key: 'a', color: '#22c55e' },
  { key: 's', color: '#ef4444' },
  { key: 'j', color: '#eab308' },
  { key: 'k', color: '#3b82f6' },
  { key: 'l', color: '#f97316' },
]

const BASE_NOTE_SPEED = 3
const HIT_WINDOW = 0.15
const MIN_TIME_BETWEEN_NOTES = 0.25
const BASE_BPM = 120 // BPM de referencia para velocidad normal

function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

function detectBPM(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  // Detectar picos de energía
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

  // Encontrar el intervalo más común (agrupando en buckets)
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

function analyzeAudio(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const notes = []
  const windowSize = Math.floor(sampleRate * 0.40) // Escanear cada 400ms
  const threshold = 0.20 // Umbral de energía
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
  const [bpm, setBpm] = useState(120)
  const [noteSpeed, setNoteSpeed] = useState(BASE_NOTE_SPEED)
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0)

  // Multiplayer states
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [roomInput, setRoomInput] = useState('')
  const [opponent, setOpponent] = useState(null)
  const [opponentScore, setOpponentScore] = useState(0)
  const [opponentCombo, setOpponentCombo] = useState(0)
  const [isHost, setIsHost] = useState(false)
  const [bothReady, setBothReady] = useState({ host: false, guest: false })
  const [countdown, setCountdown] = useState(null)
  const [opponentFinished, setOpponentFinished] = useState(null)
  const [multiplayerError, setMultiplayerError] = useState('')
  const [pendingSongLoad, setPendingSongLoad] = useState(null)
  const socketRef = useRef(null)

  // YouTube states
  const [ytPlayerReady, setYtPlayerReady] = useState(false)
  const [audioOffset, setAudioOffset] = useState(0) // Offset para sincronización
  const ytPlayerRef = useRef(null)
  const ytApiLoaded = useRef(false)

  // Upload form states
  const [uploadYoutubeUrl, setUploadYoutubeUrl] = useState('')
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadArtist, setUploadArtist] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const animationRef = useRef(null)
  const notesRef = useRef([])

  // Cargar lista de canciones al inicio
  useEffect(() => {
    fetch('/api/songs')
      .then(res => res.json())
      .then(data => setSongs(data.songs || []))
      .catch(() => {
        // Fallback a archivo estático si no hay backend
        fetch('/songs/index.json')
          .then(res => res.json())
          .then(data => setSongs(data.songs || []))
          .catch(() => console.log('No se encontró index.json'))
      })
  }, [])

  // Cargar YouTube IFrame API
  useEffect(() => {
    if (ytApiLoaded.current) return

    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)

    window.onYouTubeIframeAPIReady = () => {
      ytApiLoaded.current = true
      console.log('YouTube IFrame API loaded')
    }
  }, [])

  // Inicializar YouTube player para una canción
  const initYouTubePlayer = (videoId) => {
    if (!window.YT || !window.YT.Player) {
      console.error('YouTube API not loaded')
      return
    }

    // Destruir player anterior si existe
    if (ytPlayerRef.current) {
      ytPlayerRef.current.destroy()
      ytPlayerRef.current = null
    }

    setYtPlayerReady(false)

    ytPlayerRef.current = new window.YT.Player('youtube-player', {
      height: '200',
      width: '350',
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: () => {
          console.log('YouTube player ready')
          setYtPlayerReady(true)
        },
        onStateChange: (event) => {
          // YT.PlayerState.ENDED = 0
          if (event.data === 0) {
            setGameState('finished')
          }
        }
      }
    })
  }

  // Inicializar socket cuando se necesite
  const initSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current

    const newSocket = io(window.location.origin)
    socketRef.current = newSocket

    newSocket.on('roomCreated', ({ roomCode }) => {
      console.log('Sala creada:', roomCode)
      setRoomCode(roomCode)
      setIsHost(true)
      setGameState('lobby')
    })

    newSocket.on('joinedRoom', ({ roomCode, hostName }) => {
      console.log('Unido a sala:', roomCode)
      setRoomCode(roomCode)
      setOpponent(hostName)
      setIsHost(false)
      setGameState('lobby')
    })

    newSocket.on('playerJoined', ({ guestName }) => {
      console.log('Jugador unido:', guestName)
      setOpponent(guestName)
    })

    newSocket.on('error', (msg) => {
      console.log('Error:', msg)
      setMultiplayerError(msg)
    })

    newSocket.on('songSelected', (song) => {
      setSelectedSong(song)
      setPendingSongLoad(song)
    })

    newSocket.on('readyUpdate', ({ hostReady, guestReady }) => {
      setBothReady({ host: hostReady, guest: guestReady })
    })

    newSocket.on('startCountdown', () => {
      setCountdown(3)
    })

    newSocket.on('opponentUpdate', ({ score, combo }) => {
      setOpponentScore(score)
      setOpponentCombo(combo)
    })

    newSocket.on('opponentFinished', (data) => {
      setOpponentFinished(data)
    })

    newSocket.on('playerDisconnected', () => {
      setMultiplayerError('El oponente se desconectó')
      setOpponent(null)
    })

    return newSocket
  }, [])

  // Guest auto-load song when host selects it
  useEffect(() => {
    if (pendingSongLoad && isMultiplayer && !isHost) {
      loadSong(pendingSongLoad)
      setPendingSongLoad(null)
    }
  }, [pendingSongLoad, isMultiplayer, isHost])

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      startGame()
      return
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // Manejar subida de MP3 con formulario completo
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const fileName = file.name.replace('.mp3', '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim()

    // Si no hay título, usar nombre del archivo
    const title = uploadTitle.trim() || fileName
    const artist = uploadArtist.trim() || 'Desconocido'

    setUploadLoading(true)
    setUploadError('')
    setGameState('analyzing')

    try {
      // Subir al servidor para análisis
      const formData = new FormData()
      formData.append('audio', file)
      formData.append('title', title)
      formData.append('artist', artist)
      if (uploadYoutubeUrl.trim()) {
        formData.append('youtubeUrl', uploadYoutubeUrl.trim())
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Error del servidor')
      }

      const result = await response.json()
      console.log('Canción guardada:', result)

      // Recargar lista de canciones
      const songsRes = await fetch('/api/songs')
      if (songsRes.ok) {
        const data = await songsRes.json()
        setSongs(data.songs || [])
      }

      // Limpiar formulario
      setUploadTitle('')
      setUploadArtist('')
      setUploadYoutubeUrl('')

      // Cargar la canción recién subida
      if (result.song) {
        loadSong(result.song)
      }

      alert(`Canción "${title}" agregada correctamente!`)

    } catch (error) {
      console.error('Error subiendo canción:', error)
      setUploadError(error.message)
      setGameState('idle')
    } finally {
      setUploadLoading(false)
    }
  }

  // Cargar canción seleccionada
  const loadSong = async (song) => {
    setSelectedSong(song)
    setGameState('analyzing')

    // Si es canción de YouTube
    if (song.type === 'youtube' && song.videoId) {
      try {
        const notesPath = song.notes
        const jsonResponse = await fetch(notesPath)

        if (!jsonResponse.ok) {
          throw new Error('No se encontraron las notas')
        }

        const songData = await jsonResponse.json()
        const loadedNotes = songData.notes || songData
        const loadedBpm = songData.bpm || 120

        setBpm(loadedBpm)
        const speed = BASE_NOTE_SPEED * (loadedBpm / BASE_BPM)
        setNoteSpeed(Math.max(2, Math.min(5, speed)))

        setNotes(loadedNotes)
        notesRef.current = loadedNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))
        setLoadedFromJson(true)

        // Inicializar YouTube player
        initYouTubePlayer(song.videoId)
        setGameState('ready')
        return

      } catch (error) {
        console.error('Error cargando canción YouTube:', error)
        setGameState('idle')
        return
      }
    }

    // Canciones normales (MP3)
    const audioPath = song.audio.startsWith('/') ? song.audio : `/songs/${song.audio}`
    const notesPath = song.notes.startsWith('/') ? song.notes : `/songs/${song.notes}`

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
        const loadedBpm = songData.bpm || 120

        setBpm(loadedBpm)
        const speed = BASE_NOTE_SPEED * (loadedBpm / BASE_BPM)
        setNoteSpeed(Math.max(2, Math.min(5, speed)))

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
      const detectedBpm = detectBPM(audioBuffer)
      setBpm(detectedBpm)

      const speed = BASE_NOTE_SPEED * (detectedBpm / BASE_BPM)
      setNoteSpeed(Math.max(2, Math.min(5, speed)))

      setNotes(generatedNotes)
      notesRef.current = generatedNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))

      // Descargar JSON
      const songData = {
        song: { title: song.title, artist: song.artist, audioFile: song.audio, bpm: detectedBpm },
        notes: generatedNotes,
        bpm: detectedBpm
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

    // YouTube o MP3
    if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(0)
      ytPlayerRef.current.setVolume(volume * 100)
      ytPlayerRef.current.playVideo()
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.volume = volume
      audioRef.current.play()
    }

    setIsPaused(false)
    setGameState('playing')
  }

  const togglePause = useCallback(() => {
    if (gameState !== 'playing' && gameState !== 'paused') return

    if (isPaused) {
      // Resume
      if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
        ytPlayerRef.current.playVideo()
      } else if (audioRef.current) {
        audioRef.current.play()
      }
      setIsPaused(false)
      setGameState('playing')
    } else {
      // Pause
      if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
        ytPlayerRef.current.pauseVideo()
      } else if (audioRef.current) {
        audioRef.current.pause()
      }
      setIsPaused(true)
      setGameState('paused')
    }
  }, [gameState, isPaused, selectedSong])

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(newVolume * 100)
    } else if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  // Funciones Multiplayer
  const createRoom = () => {
    if (!playerName.trim()) {
      setMultiplayerError('Ingresa tu nombre')
      return
    }
    setMultiplayerError('')
    setIsMultiplayer(true)
    const socket = initSocket()
    socket.emit('createRoom', playerName)
  }

  const joinRoom = () => {
    if (!playerName.trim()) {
      setMultiplayerError('Ingresa tu nombre')
      return
    }
    if (!roomInput.trim()) {
      setMultiplayerError('Ingresa el código de sala')
      return
    }
    setMultiplayerError('')
    setIsMultiplayer(true)
    const socket = initSocket()
    socket.emit('joinRoom', { roomCode: roomInput.toUpperCase(), playerName })
  }

  const selectSongMultiplayer = (song) => {
    if (socketRef.current && isHost) {
      socketRef.current.emit('selectSong', song)
    }
    loadSong(song)
  }

  const setReady = () => {
    if (socketRef.current) {
      socketRef.current.emit('playerReady')
    }
  }

  const exitMultiplayer = () => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setIsMultiplayer(false)
    setRoomCode('')
    setOpponent(null)
    setOpponentScore(0)
    setOpponentCombo(0)
    setBothReady({ host: false, guest: false })
    setCountdown(null)
    setOpponentFinished(null)
    setMultiplayerError('')
    setGameState('idle')
  }

  const backToMenu = async () => {
    // Detener YouTube player si existe
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.stopVideo()
        ytPlayerRef.current.destroy()
        ytPlayerRef.current = null
      } catch (e) {}
    }
    setYtPlayerReady(false)

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
      const res = await fetch('/api/songs')
      if (res.ok) {
        const data = await res.json()
        setSongs(data.songs || [])
      }
    } catch (e) {
      console.log('Error recargando canciones')
    }
  }

  // Helper para obtener tiempo actual (YouTube o Audio)
  const getCurrentTime = useCallback(() => {
    if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
      try {
        return ytPlayerRef.current.getCurrentTime() + audioOffset
      } catch (e) {
        return 0
      }
    }
    return audioRef.current?.currentTime || 0
  }, [selectedSong, audioOffset])

  const gameLoop = useCallback(() => {
    // Verificar que tenemos un reproductor activo
    const isYouTube = selectedSong?.type === 'youtube'
    if (!isYouTube && !audioRef.current) return
    if (isYouTube && !ytPlayerRef.current) return

    const currentTime = getCurrentTime()

    const effectiveSpeed = noteSpeed / speedMultiplier // Mayor multiplicador = notas más rápidas
    const visibleNotes = notesRef.current.filter(note => {
      const noteScreenTime = note.time - currentTime
      return noteScreenTime <= effectiveSpeed && noteScreenTime >= -0.5 && !note.hit
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

    // Verificar si terminó (YouTube se maneja con onStateChange, pero también chequeamos aquí)
    const isEnded = isYouTube
      ? (ytPlayerRef.current?.getPlayerState?.() === 0) // YT.PlayerState.ENDED
      : audioRef.current?.ended

    if (isEnded) {
      // Emit final results in multiplayer
      if (socketRef.current && isMultiplayer) {
        socketRef.current.emit('gameFinished', {
          score,
          hits,
          misses,
          maxCombo,
          total: notesRef.current.length
        })
      }
      setGameState('finished')
      return
    }

    animationRef.current = requestAnimationFrame(gameLoop)
  }, [noteSpeed, speedMultiplier, score, hits, misses, maxCombo, isMultiplayer, selectedSong, getCurrentTime])

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

      // Usar getCurrentTime que maneja tanto YouTube como audio normal
      const currentTime = getCurrentTime()

      const hitNote = notesRef.current.find(note =>
        note.lane === laneIndex &&
        !note.hit &&
        !note.missed &&
        Math.abs(note.time - currentTime) <= HIT_WINDOW
      )

      if (hitNote) {
        hitNote.hit = true
        const newHits = hits + 1
        const newCombo = combo + 1
        const newScore = score + 100 * (1 + Math.floor(newCombo / 10))
        setHits(newHits)
        setCombo(newCombo)
        setScore(newScore)
        setFeedback(prev => ({ ...prev, [laneIndex]: { type: 'hit', time: Date.now() } }))

        // Enviar actualización multiplayer
        if (socketRef.current && isMultiplayer) {
          socketRef.current.emit('scoreUpdate', { score: newScore, combo: newCombo, hits: newHits, misses })
        }
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
  }, [gameState, combo, togglePause, isPaused, getCurrentTime])

  // Tiempo actual para renderizar notas
  const currentTime = selectedSong?.type === 'youtube' && ytPlayerRef.current
    ? (ytPlayerRef.current.getCurrentTime?.() || 0) + audioOffset
    : (audioRef.current?.currentTime || 0)

  return (
    <div className="app">
      <audio ref={audioRef} />

      {/* YouTube Player Container - siempre presente pero oculto cuando no se usa */}
      <div
        id="youtube-player-container"
        className={`youtube-player-container ${selectedSong?.type === 'youtube' && (gameState === 'playing' || gameState === 'paused') ? 'visible' : ''}`}
      >
        <div id="youtube-player"></div>
      </div>

      <div className="header">
        <h1>Guitar Flash Clone</h1>
        <div className="stats">
          <span>Score: {score}</span>
          <span>Combo: {combo}x</span>
          <span>Hits: {hits}</span>
          <span>Miss: {misses}</span>
          <span>BPM: {bpm}</span>
          {isMultiplayer && opponent && (
            <span className="opponent-score">VS {opponent}: {opponentScore} ({opponentCombo}x)</span>
          )}
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
          <label className="speed-control">
            Velocidad
            <select
              value={speedMultiplier}
              onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
              <option value="2.5">2.5x</option>
              <option value="3">3x</option>
              <option value="4">4x</option>
              <option value="5">5x</option>
              <option value="6">6x</option>
              <option value="7">7x</option>
              <option value="8">8x</option>
              <option value="9">9x</option>
              <option value="10">10x</option>
            </select>
          </label>
          <span className="pause-hint">P = Pausa | ESC = Menu</span>
        </div>
      </div>

      {gameState === 'idle' && !selectedSong && !isMultiplayer && (
        <div className="menu">
          <h2>Selecciona una Cancion</h2>
          <div className="song-list">
            {songs.map(song => (
              <button
                key={song.id}
                className={`song-button ${song.type === 'youtube' ? 'youtube-song' : ''}`}
                onClick={() => loadSong(song)}
              >
                <span className="song-title">
                  {song.type === 'youtube' && <span className="yt-badge">YT</span>}
                  {song.title}
                </span>
                <span className="song-artist">{song.artist}</span>
              </button>
            ))}
          </div>

          <div className="upload-divider">
            <span>o sube tu propio MP3</span>
          </div>

          <div className="upload-section">
            <input
              type="text"
              placeholder="Título (opcional)"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="upload-input"
              disabled={uploadLoading}
            />
            <input
              type="text"
              placeholder="Artista (opcional)"
              value={uploadArtist}
              onChange={(e) => setUploadArtist(e.target.value)}
              className="upload-input"
              disabled={uploadLoading}
            />
            <input
              type="text"
              placeholder="URL de YouTube para embed (opcional)"
              value={uploadYoutubeUrl}
              onChange={(e) => setUploadYoutubeUrl(e.target.value)}
              className="upload-input youtube-url"
              disabled={uploadLoading}
            />
            <p className="upload-hint">Si agregas YouTube URL, el video se usará para reproducir la música</p>

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
              disabled={uploadLoading}
            >
              {uploadLoading ? 'Subiendo...' : 'Seleccionar MP3 y Subir'}
            </button>
            {uploadError && <p className="error-msg">{uploadError}</p>}
          </div>

          <div className="upload-divider">
            <span>Multiplayer</span>
          </div>

          <div className="multiplayer-section">
            <input
              type="text"
              placeholder="Tu nombre"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="multiplayer-input"
            />
            <div className="multiplayer-buttons">
              <button className="multiplayer-btn create" onClick={createRoom}>
                Crear Sala
              </button>
              <div className="join-section">
                <input
                  type="text"
                  placeholder="Código"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  className="room-code-input"
                  maxLength={6}
                />
                <button className="multiplayer-btn join" onClick={joinRoom}>
                  Unirse
                </button>
              </div>
            </div>
            {multiplayerError && <p className="error-msg">{multiplayerError}</p>}
          </div>

          <p className="instructions">Teclas: A S J K L</p>
        </div>
      )}

      {(['lobby', 'analyzing', 'ready'].includes(gameState)) && isMultiplayer && (
        <div className="menu lobby">
          <h2>Sala: {roomCode}</h2>
          <div className="players-list">
            <div className="player-item">
              <span className="player-name">{playerName} (Tú){isHost ? ' - Host' : ''}</span>
              <span className={`ready-status ${isHost ? (bothReady.host ? 'ready' : '') : (bothReady.guest ? 'ready' : '')}`}>
                {(isHost ? bothReady.host : bothReady.guest) ? 'LISTO' : 'Esperando...'}
              </span>
            </div>
            {opponent ? (
              <div className="player-item">
                <span className="player-name">{opponent}{!isHost ? ' - Host' : ''}</span>
                <span className={`ready-status ${!isHost ? (bothReady.host ? 'ready' : '') : (bothReady.guest ? 'ready' : '')}`}>
                  {(!isHost ? bothReady.host : bothReady.guest) ? 'LISTO' : 'Esperando...'}
                </span>
              </div>
            ) : (
              <div className="player-item waiting">
                <span>Esperando oponente...</span>
              </div>
            )}
          </div>

          {isHost && opponent && gameState !== 'analyzing' && (
            <>
              <h3>Selecciona Canción:</h3>
              <div className="song-list">
                {songs.map(song => (
                  <button
                    key={song.id}
                    className={`song-button ${selectedSong?.id === song.id ? 'selected' : ''}`}
                    onClick={() => selectSongMultiplayer(song)}
                  >
                    <span className="song-title">{song.title}</span>
                    <span className="song-artist">{song.artist}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedSong && (
            <p className="song-info">Canción: {selectedSong.title} - {selectedSong.artist}</p>
          )}

          {gameState === 'analyzing' && (
            <>
              <p>Cargando canción...</p>
              <div className="loader"></div>
            </>
          )}

          {selectedSong && gameState === 'ready' && (
            <button className="ready-button" onClick={setReady}>
              {(isHost ? bothReady.host : bothReady.guest) ? 'Esperando al otro...' : 'LISTO!'}
            </button>
          )}

          {countdown !== null && (
            <div className="countdown">{countdown}</div>
          )}

          <button className="back-button" onClick={exitMultiplayer}>Salir</button>
        </div>
      )}

      {gameState === 'analyzing' && !isMultiplayer && (
        <div className="menu">
          <h2>Analizando audio...</h2>
          <div className="loader"></div>
        </div>
      )}

      {gameState === 'ready' && !isMultiplayer && (
        <div className="menu">
          <h2>Listo!</h2>
          <p className="song-info">{selectedSong?.title} - {selectedSong?.artist}</p>
          <p>{notes.length} notas {loadedFromJson ? 'cargadas' : 'generadas'} | {bpm} BPM</p>
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
          {isMultiplayer ? (
            <>
              <h2>Resultados</h2>
              <div className="multiplayer-results">
                <div className={`player-result ${score > (opponentFinished?.score || 0) ? 'winner' : score < (opponentFinished?.score || 0) ? 'loser' : ''}`}>
                  <h3>{playerName} (Tú)</h3>
                  <p className="result-score">{score}</p>
                  <p>Hits: {hits} / {notes.length}</p>
                  <p>Precisión: {notes.length > 0 ? Math.round((hits / notes.length) * 100) : 0}%</p>
                  <p>Max Combo: {maxCombo}x</p>
                </div>
                {opponentFinished ? (
                  <div className={`player-result ${opponentFinished.score > score ? 'winner' : opponentFinished.score < score ? 'loser' : ''}`}>
                    <h3>{opponent}</h3>
                    <p className="result-score">{opponentFinished.score}</p>
                    <p>Hits: {opponentFinished.hits} / {opponentFinished.total || notes.length}</p>
                    <p>Precisión: {(opponentFinished.total || notes.length) > 0 ? Math.round((opponentFinished.hits / (opponentFinished.total || notes.length)) * 100) : 0}%</p>
                    <p>Max Combo: {opponentFinished.maxCombo}x</p>
                  </div>
                ) : (
                  <div className="player-result waiting">
                    <h3>{opponent}</h3>
                    <p>Esperando...</p>
                    <div className="loader"></div>
                  </div>
                )}
              </div>
              {opponentFinished && (
                <div className="winner-announcement">
                  {score > opponentFinished.score ? (
                    <h2 className="you-win">¡GANASTE!</h2>
                  ) : score < opponentFinished.score ? (
                    <h2 className="you-lose">Perdiste</h2>
                  ) : (
                    <h2 className="tie">¡Empate!</h2>
                  )}
                </div>
              )}
              <button className="back-button" onClick={exitMultiplayer}>Volver al Menu</button>
            </>
          ) : (
            <>
              <h2>Cancion Terminada!</h2>
              <div className="final-stats">
                <p>Score Final: <strong>{score}</strong></p>
                <p>Hits: {hits} / {notes.length}</p>
                <p>Precision: {notes.length > 0 ? Math.round((hits / notes.length) * 100) : 0}%</p>
                <p>Max Combo: {maxCombo}x</p>
              </div>
              <button onClick={startGame}>Jugar de Nuevo</button>
              <button className="back-button" onClick={backToMenu}>Volver al Menu</button>
            </>
          )}
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
                  const effectiveSpeed = noteSpeed / speedMultiplier
                  const progress = 1 - (noteScreenTime / effectiveSpeed)
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
