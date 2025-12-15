const express = require('express')
const multer = require('multer')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

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

  res.json({ songs: allSongs })
})

// Fallback al frontend (Express 5 syntax)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
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
