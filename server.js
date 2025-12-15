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

// Configurar multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const songsDir = path.join(__dirname, 'dist', 'songs')
    if (!fs.existsSync(songsDir)) {
      fs.mkdirSync(songsDir, { recursive: true })
    }
    cb(null, songsDir)
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
app.post('/api/upload', upload.single('audio'), async (req, res) => {
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
      const notesPath = path.join(__dirname, 'dist', 'songs', notesFilename)
      const notesData = JSON.parse(notes)
      fs.writeFileSync(notesPath, JSON.stringify(notesData, null, 2))
    }

    // Actualizar index.json
    const indexPath = path.join(__dirname, 'dist', 'songs', 'index.json')
    let indexData = { songs: [] }

    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf8')
      indexData = JSON.parse(indexContent)
    }

    // Verificar si la canción ya existe
    const existingIndex = indexData.songs.findIndex(s => s.id === songId)
    const songEntry = {
      id: songId,
      title: title || songId,
      artist: artist || 'Desconocido',
      audio: audioFilename,
      notes: notesFilename
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
    res.status(500).json({ error: 'Error al guardar la canción' })
  }
})

// Endpoint para obtener lista de canciones
app.get('/api/songs', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'songs', 'index.json')

  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8')
    res.json(JSON.parse(indexContent))
  } else {
    res.json({ songs: [] })
  }
})

// Todas las rutas no-API van al frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`)
})
