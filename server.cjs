const express = require('express')
const multer = require('multer')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const { Server } = require('socket.io')

// Carpetas
const TEMP_DIR = path.join(__dirname, 'temp')
const YOUTUBE_DIR = path.join(__dirname, 'uploads', 'youtube')

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

// Servir index.html del dist PRIMERO para la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

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

// Carpeta para uploads
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'songs')

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

// Descargar archivo desde URL
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(outputPath)

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve(outputPath)
      })
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {})
      reject(err)
    })
  })
}

// Obtener info del video desde YouTube oEmbed API (gratis, sin auth)
async function getYouTubeInfo(videoId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`

    https.get(url, (response) => {
      let data = ''
      response.on('data', chunk => { data += chunk })
      response.on('end', () => {
        try {
          const info = JSON.parse(data)
          resolve({
            title: info.title || 'Sin título',
            artist: info.author_name || 'Desconocido',
            thumbnail: info.thumbnail_url
          })
        } catch (e) {
          // Si falla oEmbed, usar valores por defecto
          resolve({
            title: `YouTube Video ${videoId}`,
            artist: 'YouTube',
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
          })
        }
      })
    }).on('error', () => {
      resolve({
        title: `YouTube Video ${videoId}`,
        artist: 'YouTube',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      })
    })
  })
}

// Descargar audio usando RapidAPI YouTube MP3
const RAPIDAPI_KEY = '3d139d3860msh923f812efb2ff32p17c909jsn0e158354a77e'

// Helper para hacer requests HTTPS
function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch (e) {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })
    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

async function getYouTubeAudioUrl(videoId) {
  console.log(`[RapidAPI] Intentando obtener audio para: ${videoId}`)

  // Usar coolguruji-youtube-to-mp3-download API
  // Probar múltiples endpoints comunes
  const endpoints = ['/dl', '/download', '/mp3', '/convert']

  for (const endpoint of endpoints) {
    const options = {
      hostname: 'coolguruji-youtube-to-mp3-download-v1.p.rapidapi.com',
      path: `${endpoint}?id=${videoId}`,
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'coolguruji-youtube-to-mp3-download-v1.p.rapidapi.com'
      }
    }

    console.log(`[RapidAPI] Probando endpoint: ${endpoint}`)

    try {
      const result = await httpsRequest(options)
      console.log(`[RapidAPI] ${endpoint} -> Status:`, result.status)

      if (result.status === 200) {
        console.log('[RapidAPI] Respuesta:', JSON.stringify(result.data).substring(0, 500))

        const response = result.data
        if (response.error || response.status === 'fail') {
          continue // Try next endpoint
        }

        const downloadUrl = response.link || response.url || response.download ||
                            response.mp3 || response.audio || response.dlink

        if (downloadUrl) {
          return downloadUrl
        }
      }
    } catch (e) {
      console.log(`[RapidAPI] ${endpoint} falló:`, e.message)
    }
  }

  throw new Error('No se pudo obtener URL de ningún endpoint')
}

// Endpoint para agregar canción de YouTube
app.post('/api/youtube/add', async (req, res) => {
  const { url } = req.body

  if (!url) {
    return res.status(400).json({ error: 'URL requerida' })
  }

  const videoId = extractYouTubeId(url)
  if (!videoId) {
    return res.status(400).json({ error: 'URL de YouTube inválida' })
  }

  // Verificar si ya existe
  const youtubeIndexPath = path.join(YOUTUBE_DIR, 'index.json')
  let existingSongs = { songs: [] }
  if (fs.existsSync(youtubeIndexPath)) {
    try {
      existingSongs = JSON.parse(fs.readFileSync(youtubeIndexPath, 'utf8'))
      const existing = existingSongs.songs.find(s => s.videoId === videoId)
      if (existing) {
        return res.json({ success: true, message: 'Canción ya existe', song: existing, alreadyExists: true })
      }
    } catch (e) {}
  }

  // Crear directorios si no existen
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })
  if (!fs.existsSync(YOUTUBE_DIR)) fs.mkdirSync(YOUTUBE_DIR, { recursive: true })

  const tempFile = path.join(TEMP_DIR, `${videoId}.mp3`)

  try {
    // Obtener info del video
    console.log(`[YouTube] Obteniendo info de ${videoId}...`)
    const videoInfo = await getYouTubeInfo(videoId)

    // Obtener URL de descarga via RapidAPI
    console.log(`[YouTube] Obteniendo URL de audio via RapidAPI...`)
    const audioUrl = await getYouTubeAudioUrl(videoId)

    // Descargar el archivo de audio
    console.log(`[YouTube] Descargando audio desde: ${audioUrl.substring(0, 50)}...`)
    await downloadFile(audioUrl, tempFile)

    // Verificar que el archivo existe
    if (!fs.existsSync(tempFile)) {
      throw new Error('No se pudo descargar el audio')
    }

    // Analizar audio
    console.log(`[YouTube] Analizando audio...`)

    // Dynamic import for audio-decode (ES module)
    const audioDecode = await import('audio-decode')
    const audioBuffer = fs.readFileSync(tempFile)
    const decoded = await audioDecode.default(audioBuffer)

    const channelData = decoded.getChannelData(0)
    const sampleRate = decoded.sampleRate

    const notes = analyzeAudioBuffer(channelData, sampleRate)
    const bpm = detectBPM(channelData, sampleRate)

    console.log(`[YouTube] Generadas ${notes.length} notas, BPM: ${bpm}`)

    // Guardar JSON de notas
    const notesData = {
      song: {
        title: videoInfo.title,
        artist: videoInfo.artist,
        videoId: videoId,
        bpm: bpm
      },
      notes: notes,
      bpm: bpm
    }

    const notesFilename = `${videoId}.json`
    fs.writeFileSync(path.join(YOUTUBE_DIR, notesFilename), JSON.stringify(notesData, null, 2))

    // Actualizar index
    const songEntry = {
      id: `yt-${videoId}`,
      videoId: videoId,
      title: videoInfo.title,
      artist: videoInfo.artist,
      thumbnail: videoInfo.thumbnail,
      notes: `/uploads/youtube/${notesFilename}`,
      type: 'youtube',
      bpm: bpm
    }

    existingSongs.songs.push(songEntry)
    fs.writeFileSync(youtubeIndexPath, JSON.stringify(existingSongs, null, 2))

    // Eliminar archivo temporal
    try {
      fs.unlinkSync(tempFile)
      console.log(`[YouTube] Archivo temporal eliminado`)
    } catch (e) {
      console.error(`[YouTube] Error eliminando temp:`, e.message)
    }

    res.json({
      success: true,
      message: 'Canción procesada correctamente',
      song: songEntry
    })

  } catch (error) {
    console.error('[YouTube] Error:', error.message)

    // Limpiar archivo temporal si existe
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    } catch (e) {}

    res.status(500).json({ error: error.message })
  }
})

// Endpoint para subir canción
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

      const { title, artist, notes } = req.body
      const audioFilename = req.file.filename
      const songId = audioFilename.replace('.mp3', '')
      const notesFilename = `${songId}.json`

      if (notes) {
        const notesPath = path.join(UPLOADS_DIR, notesFilename)
        const notesData = JSON.parse(notes)
        fs.writeFileSync(notesPath, JSON.stringify(notesData, null, 2))
      }

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

      const existingIndex = indexData.songs.findIndex(s => s.id === songId)
      const songEntry = {
        id: songId,
        title: title || songId,
        artist: artist || 'Desconocido',
        audio: `/uploads/songs/${audioFilename}`,
        notes: `/uploads/songs/${notesFilename}`
      }

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

  // YouTube songs
  const youtubeIndexPath = path.join(YOUTUBE_DIR, 'index.json')
  if (fs.existsSync(youtubeIndexPath)) {
    try {
      const youtubeContent = fs.readFileSync(youtubeIndexPath, 'utf8')
      const youtubeData = JSON.parse(youtubeContent)
      if (Array.isArray(youtubeData.songs)) {
        allSongs = [...allSongs, ...youtubeData.songs]
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
