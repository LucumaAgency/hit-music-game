const express = require('express')
const multer = require('multer')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { Server } = require('socket.io')

// Carpetas
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'songs')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

const PORT = process.env.PORT || 3000

// Almacenar salas activas
const rooms = new Map()

// Middleware
app.use(cors())
app.use(express.json())

// Servir index.html del dist para la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// Endpoint explícito para JS (forzar MIME type)
app.get('/api/app/assets/:filename', (req, res) => {
  const filename = req.params.filename
  const filePath = path.join(__dirname, 'dist', 'assets', filename)

  if (!fs.existsSync(filePath)) {
    console.log('File not found:', filePath)
    return res.status(404).send('Not found: ' + filename)
  }

  const content = fs.readFileSync(filePath)

  if (filename.endsWith('.js')) {
    res.set('Content-Type', 'application/javascript; charset=utf-8')
  } else if (filename.endsWith('.css')) {
    res.set('Content-Type', 'text/css; charset=utf-8')
  }

  res.send(content)
})

// Servir otros assets desde /api/app/
app.use('/api/app', express.static(path.join(__dirname, 'dist')))

// Servir archivos estáticos del build con MIME types correctos
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript')
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css')
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json')
    }
  }
}))

// Servir archivos de uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Endpoint de prueba
app.get('/api/test', (req, res) => {
  res.json({
    ok: true,
    message: 'Node.js funcionando',
    dirname: __dirname,
    uploadsDir: UPLOADS_DIR
  })
})

// Configurar multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    }
    cb(null, UPLOADS_DIR)
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-')
    cb(null, cleanName)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'audio/mpeg' || file.originalname.endsWith('.mp3')) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos MP3'), false)
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }
})

// =====================
// YOUTUBE FUNCTIONS
// =====================

// Extraer video ID de URL de YouTube
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Función de random con seed (igual que en frontend)
function seededRandom(seed) {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

// Detectar BPM del audio
function detectBPM(channelData, sampleRate) {
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

  const intervals = []
  for (let i = 1; i < peaks.length; i++) {
    const interval = peaks[i] - peaks[i - 1]
    if (interval > 0.2 && interval < 2) {
      intervals.push(interval)
    }
  }

  if (intervals.length === 0) return 120

  const buckets = {}
  intervals.forEach(interval => {
    const bucket = Math.round(interval * 10) / 10
    buckets[bucket] = (buckets[bucket] || 0) + 1
  })

  let mostCommonInterval = 0.5
  let maxCount = 0
  Object.entries(buckets).forEach(([interval, count]) => {
    if (count > maxCount) {
      maxCount = count
      mostCommonInterval = parseFloat(interval)
    }
  })

  const bpm = Math.round(60 / mostCommonInterval)
  return Math.max(60, Math.min(200, bpm))
}

// Analizar audio y generar notas
function analyzeAudioBuffer(channelData, sampleRate) {
  const notes = []
  const windowSize = Math.floor(sampleRate * 0.40)
  const threshold = 0.20
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

    if (energy > threshold && max > 0.30) {
      if (time - lastNoteTime >= minTimeBetweenNotes) {
        const lane = Math.floor(seededRandom(time * 1000 + noteIndex) * 5)
        notes.push({ time: Math.round(time * 1000) / 1000, lane })
        lastNoteTime = time
        noteIndex++
      }
    }
  }

  // Agregar notas extra en huecos grandes
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

  // Agregar acordes (20% probabilidad)
  const notesWithChords = []
  for (let i = 0; i < allNotes.length; i++) {
    notesWithChords.push(allNotes[i])
    if (seededRandom(allNotes[i].time * 333 + i) > 0.8) {
      let secondLane = Math.floor(seededRandom(allNotes[i].time * 555 + i) * 5)
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

// Endpoint para subir canción (con soporte para YouTube embed)
app.post('/api/upload', (req, res) => {
  upload.single('audio')(req, res, async (err) => {
    if (err) {
      console.error('Error en multer:', err)
      return res.status(400).json({ error: err.message })
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió archivo de audio' })
      }

      const { title, artist, youtubeUrl } = req.body
      const audioFilename = req.file.filename
      const audioPath = path.join(UPLOADS_DIR, audioFilename)
      const songId = audioFilename.replace('.mp3', '')
      const notesFilename = `${songId}.json`

      // Extraer videoId si hay YouTube URL
      let videoId = null
      if (youtubeUrl) {
        videoId = extractYouTubeId(youtubeUrl)
        console.log(`[Upload] YouTube videoId: ${videoId}`)
      }

      // Analizar el MP3 y generar notas en el servidor
      console.log(`[Upload] Analizando audio: ${audioFilename}`)
      const audioDecode = await import('audio-decode')
      const audioBuffer = fs.readFileSync(audioPath)
      const decoded = await audioDecode.default(audioBuffer)

      const channelData = decoded.getChannelData(0)
      const sampleRate = decoded.sampleRate

      const notes = analyzeAudioBuffer(channelData, sampleRate)
      const bpm = detectBPM(channelData, sampleRate)

      console.log(`[Upload] Generadas ${notes.length} notas, BPM: ${bpm}`)

      // Guardar JSON de notas
      const notesData = {
        song: { title: title || songId, artist: artist || 'Desconocido', bpm },
        notes,
        bpm
      }
      fs.writeFileSync(path.join(UPLOADS_DIR, notesFilename), JSON.stringify(notesData, null, 2))

      // Actualizar index
      const indexPath = path.join(UPLOADS_DIR, 'index.json')
      let indexData = { songs: [] }

      if (fs.existsSync(indexPath)) {
        try {
          const indexContent = fs.readFileSync(indexPath, 'utf8')
          const parsed = JSON.parse(indexContent)
          indexData = { songs: Array.isArray(parsed.songs) ? parsed.songs : [] }
        } catch (e) {
          indexData = { songs: [] }
        }
      }

      const songEntry = {
        id: songId,
        title: title || songId,
        artist: artist || 'Desconocido',
        audio: `/uploads/songs/${audioFilename}`,
        notes: `/uploads/songs/${notesFilename}`,
        bpm
      }

      // Si hay YouTube, agregar videoId y type
      if (videoId) {
        songEntry.videoId = videoId
        songEntry.type = 'youtube'
        songEntry.thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      }

      const existingIndex = indexData.songs.findIndex(s => s.id === songId)
      if (existingIndex >= 0) {
        indexData.songs[existingIndex] = songEntry
      } else {
        indexData.songs.push(songEntry)
      }

      fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2))

      res.json({
        success: true,
        message: 'Canción guardada correctamente',
        song: songEntry
      })
    } catch (error) {
      console.error('Error subiendo canción:', error)
      res.status(500).json({ error: 'Error al guardar la canción: ' + error.message })
    }
  })
})

// Endpoint para guardar notas grabadas
app.post('/api/save-notes', (req, res) => {
  try {
    const { songId, notesData } = req.body

    if (!songId || !notesData) {
      return res.status(400).json({ error: 'Faltan datos requeridos' })
    }

    const notesFilename = `${songId}.json`
    const notesPath = path.join(UPLOADS_DIR, notesFilename)

    // Verificar que el archivo existe
    if (!fs.existsSync(notesPath)) {
      return res.status(404).json({ error: 'Canción no encontrada' })
    }

    // Guardar las notas
    fs.writeFileSync(notesPath, JSON.stringify(notesData, null, 2))

    console.log(`[SaveNotes] Guardadas ${notesData.notes?.length || 0} notas para ${songId}`)

    res.json({
      success: true,
      message: 'Notas guardadas correctamente',
      notesCount: notesData.notes?.length || 0
    })
  } catch (error) {
    console.error('Error guardando notas:', error)
    res.status(500).json({ error: 'Error al guardar las notas: ' + error.message })
  }
})

// Endpoint para obtener lista de canciones
app.get('/api/songs', (req, res) => {
  let allSongs = []

  const distIndexPath = path.join(__dirname, 'dist', 'songs', 'index.json')
  if (fs.existsSync(distIndexPath)) {
    try {
      const distContent = fs.readFileSync(distIndexPath, 'utf8')
      const distData = JSON.parse(distContent)
      if (Array.isArray(distData.songs)) {
        allSongs = distData.songs.map(s => ({
          ...s,
          audio: s.audio.startsWith('/') ? s.audio : `/songs/${s.audio}`,
          notes: s.notes.startsWith('/') ? s.notes : `/songs/${s.notes}`
        }))
      }
    } catch (e) {}
  }

  const uploadsIndexPath = path.join(UPLOADS_DIR, 'index.json')
  if (fs.existsSync(uploadsIndexPath)) {
    try {
      const uploadsContent = fs.readFileSync(uploadsIndexPath, 'utf8')
      const uploadsData = JSON.parse(uploadsContent)
      if (Array.isArray(uploadsData.songs)) {
        allSongs = [...allSongs, ...uploadsData.songs]
      }
    } catch (e) {}
  }

  res.json({ songs: allSongs })
})

// Fallback al frontend (Express 5 syntax)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// Socket.io - Multiplayer
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id)

  // Crear sala
  socket.on('createRoom', (playerName) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    rooms.set(roomCode, {
      host: socket.id,
      hostName: playerName,
      guest: null,
      guestName: null,
      song: null,
      hostReady: false,
      guestReady: false,
      hostScore: 0,
      guestScore: 0,
      hostCombo: 0,
      guestCombo: 0,
      gameStarted: false
    })
    socket.join(roomCode)
    socket.roomCode = roomCode
    socket.emit('roomCreated', { roomCode, playerName })
    console.log(`Sala ${roomCode} creada por ${playerName}`)
  })

  // Unirse a sala
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode)
    if (!room) {
      socket.emit('error', 'Sala no encontrada')
      return
    }
    if (room.guest) {
      socket.emit('error', 'Sala llena')
      return
    }
    room.guest = socket.id
    room.guestName = playerName
    socket.join(roomCode)
    socket.roomCode = roomCode
    socket.emit('joinedRoom', { roomCode, hostName: room.hostName, playerName })
    io.to(room.host).emit('playerJoined', { guestName: playerName })
    console.log(`${playerName} se unió a sala ${roomCode}`)
  })

  // Seleccionar canción
  socket.on('selectSong', (song) => {
    const room = rooms.get(socket.roomCode)
    if (!room) return
    room.song = song
    io.to(socket.roomCode).emit('songSelected', song)
  })

  // Jugador listo
  socket.on('playerReady', () => {
    const room = rooms.get(socket.roomCode)
    if (!room) return

    if (socket.id === room.host) {
      room.hostReady = true
    } else {
      room.guestReady = true
    }

    io.to(socket.roomCode).emit('readyUpdate', {
      hostReady: room.hostReady,
      guestReady: room.guestReady
    })

    // Si ambos están listos, iniciar countdown
    if (room.hostReady && room.guestReady) {
      room.gameStarted = true
      io.to(socket.roomCode).emit('startCountdown')
    }
  })

  // Actualizar score
  socket.on('scoreUpdate', ({ score, combo, hits, misses }) => {
    const room = rooms.get(socket.roomCode)
    if (!room) return

    if (socket.id === room.host) {
      room.hostScore = score
      room.hostCombo = combo
      io.to(room.guest).emit('opponentUpdate', { score, combo, hits, misses })
    } else {
      room.guestScore = score
      room.guestCombo = combo
      io.to(room.host).emit('opponentUpdate', { score, combo, hits, misses })
    }
  })

  // Juego terminado
  socket.on('gameFinished', ({ score, hits, misses, maxCombo }) => {
    const room = rooms.get(socket.roomCode)
    if (!room) return

    const isHost = socket.id === room.host
    const opponent = isHost ? room.guest : room.host

    io.to(opponent).emit('opponentFinished', { score, hits, misses, maxCombo })
  })

  // Desconexión
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id)
    if (socket.roomCode) {
      const room = rooms.get(socket.roomCode)
      if (room) {
        io.to(socket.roomCode).emit('playerDisconnected')
        rooms.delete(socket.roomCode)
      }
    }
  })
})

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`)
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
      console.log('Directorio de uploads creado')
    }
  } catch (e) {
    console.error('ERROR creando uploads:', e.message)
  }
})
