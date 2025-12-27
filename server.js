import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Servir archivos estáticos del build
app.use(express.static(path.join(__dirname, 'dist')))

// Servir archivos de uploads (canciones subidas por usuarios)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Carpeta para uploads (fuera de dist para no ser sobrescrita por deploys)
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'songs')

// Endpoint de prueba con debug incluido
app.get('/api/test', (req, res) => {
  const showDebug = req.query.debug === '1'

  const response = {
    ok: true,
    version: 2,
    message: 'Node.js funcionando',
    dirname: __dirname,
    uploadsDir: UPLOADS_DIR
  }

  if (showDebug) {
    // Info de debug
    response.debug = {
      timestamp: new Date().toISOString(),
      uploadsExists: fs.existsSync(UPLOADS_DIR),
      uploadsFiles: [],
      mp3Files: [],
      errors: []
    }

    try {
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR)
        response.debug.uploadsFiles = files
        response.debug.mp3Files = files.filter(f => f.toLowerCase().endsWith('.mp3'))
        response.debug.jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json'))
      } else {
        response.debug.errors.push('Carpeta uploads/songs NO existe')
      }
    } catch (e) {
      response.debug.errors.push(e.message)
    }
  }

  res.json(response)
})

// Endpoint de debug para diagnosticar problemas con canciones
app.get('/api/debug', (req, res) => {
  try {
    const debug = {
      timestamp: new Date().toISOString(),
      serverInfo: {
        dirname: __dirname,
        cwd: process.cwd(),
        nodeVersion: process.version,
        platform: process.platform,
        env: process.env.NODE_ENV || 'not set'
      },
      uploadsDir: {
        path: UPLOADS_DIR,
        exists: false,
        readable: false,
        files: [],
        mp3Files: [],
        jsonFiles: [],
        mp3Details: []
      },
      distSongsDir: {
        path: path.join(__dirname, 'dist', 'songs'),
        exists: false,
        files: [],
        indexContent: null
      },
      parentDirs: {
        uploadsParent: path.join(__dirname, 'uploads'),
        uploadsParentExists: false,
        uploadsParentFiles: []
      },
      errors: [],
      songsApiResult: []
    }

    // Verificar carpeta padre de uploads
    try {
      debug.parentDirs.uploadsParentExists = fs.existsSync(path.join(__dirname, 'uploads'))
      if (debug.parentDirs.uploadsParentExists) {
        debug.parentDirs.uploadsParentFiles = fs.readdirSync(path.join(__dirname, 'uploads'))
      }
    } catch (e) {
      debug.errors.push(`Error verificando uploads padre: ${e.message}`)
    }

    // Verificar contenido de uploads/songs
    try {
      debug.uploadsDir.exists = fs.existsSync(UPLOADS_DIR)
      if (debug.uploadsDir.exists) {
        const files = fs.readdirSync(UPLOADS_DIR)
        debug.uploadsDir.readable = true
        debug.uploadsDir.files = files
        debug.uploadsDir.mp3Files = files.filter(f => f.toLowerCase().endsWith('.mp3'))
        debug.uploadsDir.jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json'))

        // Mostrar info detallada de cada MP3
        debug.uploadsDir.mp3Details = debug.uploadsDir.mp3Files.map(f => {
          try {
            const stat = fs.statSync(path.join(UPLOADS_DIR, f))
            return {
              filename: f,
              size: stat.size,
              parsed: parseFilename(f)
            }
          } catch (e) {
            return { filename: f, error: e.message }
          }
        })
      }
    } catch (e) {
      debug.errors.push(`Error leyendo uploads/songs: ${e.message}`)
    }

    if (!debug.uploadsDir.exists) {
      debug.errors.push(`Carpeta uploads/songs NO existe en: ${UPLOADS_DIR}`)
    }

    // Verificar contenido de dist/songs
    try {
      debug.distSongsDir.exists = fs.existsSync(path.join(__dirname, 'dist', 'songs'))
      if (debug.distSongsDir.exists) {
        debug.distSongsDir.files = fs.readdirSync(path.join(__dirname, 'dist', 'songs'))

        const distIndexPath = path.join(__dirname, 'dist', 'songs', 'index.json')
        if (fs.existsSync(distIndexPath)) {
          debug.distSongsDir.indexContent = JSON.parse(fs.readFileSync(distIndexPath, 'utf8'))
        }
      }
    } catch (e) {
      debug.errors.push(`Error leyendo dist/songs: ${e.message}`)
    }

    // Simular lo que devolvería /api/songs
    let allSongs = []

    // Canciones de dist
    if (debug.distSongsDir.indexContent?.songs) {
      allSongs = debug.distSongsDir.indexContent.songs.map(s => ({
        ...s,
        source: 'dist',
        audio: s.audio.startsWith('/') ? s.audio : `/songs/${s.audio}`,
        notes: s.notes.startsWith('/') ? s.notes : `/songs/${s.notes}`
      }))
    }

    // Auto-detectar de uploads
    if (debug.uploadsDir.mp3Files && debug.uploadsDir.mp3Files.length > 0) {
      for (const mp3File of debug.uploadsDir.mp3Files) {
        const songId = mp3File.replace('.mp3', '')
        const { title, artist } = parseFilename(mp3File)
        allSongs.push({
          id: songId,
          title,
          artist,
          audio: `/uploads/songs/${mp3File}`,
          notes: `/uploads/songs/${songId}.json`,
          source: 'uploads-autodetect'
        })
      }
    }

    debug.songsApiResult = allSongs
    debug.totalSongsFound = allSongs.length

    res.json(debug)
  } catch (error) {
    res.status(500).json({
      error: 'Error en debug endpoint',
      message: error.message,
      stack: error.stack
    })
  }
})

// Configurar multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    }
    cb(null, UPLOADS_DIR)
  },
  filename: (req, file, cb) => {
    // Limpiar nombre de archivo
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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
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

    // Guardar JSON de notas
    if (notes) {
      const notesPath = path.join(UPLOADS_DIR, notesFilename)
      const notesData = JSON.parse(notes)
      fs.writeFileSync(notesPath, JSON.stringify(notesData, null, 2))
    }

    // Actualizar index.json en uploads
    const indexPath = path.join(UPLOADS_DIR, 'index.json')
    let indexData = { songs: [] }

    if (fs.existsSync(indexPath)) {
      try {
        const indexContent = fs.readFileSync(indexPath, 'utf8')
        const parsed = JSON.parse(indexContent)
        indexData = { songs: Array.isArray(parsed.songs) ? parsed.songs : [] }
      } catch (e) {
        console.log('Error leyendo index.json, creando nuevo')
        indexData = { songs: [] }
      }
    }

    // Verificar si la canción ya existe
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

// Funcion para extraer titulo y artista del nombre del archivo
function parseFilename(filename) {
  // Quitar extension .mp3
  const name = filename.replace('.mp3', '')

  // Intentar separar por " - " (formato: "Artista - Titulo")
  const parts = name.split(' - ')
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim()
    }
  }

  // Si no hay separador, usar el nombre como titulo
  return {
    artist: 'Desconocido',
    title: name.replace(/-/g, ' ').trim()
  }
}

// Endpoint para obtener lista de canciones (combina predefinidas + auto-detectadas)
app.get('/api/songs', (req, res) => {
  let allSongs = []

  // Canciones predefinidas en dist/songs
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
    } catch (e) {
      console.log('Error leyendo dist/songs/index.json')
    }
  }

  // Auto-detectar MP3s en uploads/songs (sin necesidad de index.json)
  if (fs.existsSync(UPLOADS_DIR)) {
    try {
      const files = fs.readdirSync(UPLOADS_DIR)
      const mp3Files = files.filter(f => f.toLowerCase().endsWith('.mp3'))

      for (const mp3File of mp3Files) {
        const songId = mp3File.replace('.mp3', '')
        const notesFile = `${songId}.json`
        const notesPath = path.join(UPLOADS_DIR, notesFile)

        // Extraer info del nombre del archivo
        const { title, artist } = parseFilename(mp3File)

        // Verificar si hay archivo de notas y leer BPM
        let bpm = 120
        if (fs.existsSync(notesPath)) {
          try {
            const notesContent = fs.readFileSync(notesPath, 'utf8')
            const notesData = JSON.parse(notesContent)
            bpm = notesData.bpm || 120
          } catch (e) {}
        }

        allSongs.push({
          id: songId,
          title,
          artist,
          audio: `/uploads/songs/${mp3File}`,
          notes: `/uploads/songs/${notesFile}`,
          bpm
        })
      }
    } catch (e) {
      console.log('Error escaneando uploads/songs:', e.message)
    }
  }

  res.json({ songs: allSongs })
})

// Todas las rutas no-API van al frontend (Express 5 syntax)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`)
  console.log(`Directorio de uploads: ${UPLOADS_DIR}`)
  // Crear directorio de uploads al iniciar
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
      console.log('Directorio de uploads creado')
    } else {
      console.log('Directorio de uploads existe')
    }
  } catch (e) {
    console.error('ERROR: No se pudo crear directorio de uploads:', e.message)
  }
})
