import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { BASE_NOTE_SPEED, BASE_BPM } from '../constants'
import { detectBPM, analyzeAudio } from '../utils/audioAnalysis'
import { downloadJSON } from '../utils/helpers'

const AudioContext = createContext(null)

export function AudioProvider({ children }) {
  const [songs, setSongs] = useState([])
  const [selectedSong, setSelectedSong] = useState(null)
  const [volume, setVolume] = useState(0.5)
  const [bpm, setBpm] = useState(120)
  const [noteSpeed, setNoteSpeed] = useState(BASE_NOTE_SPEED)
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0)
  const [customAudioUrl, setCustomAudioUrl] = useState(null)
  const [audioOffset, setAudioOffset] = useState(0)
  const [ytPlayerReady, setYtPlayerReady] = useState(false)

  // Upload form states
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadArtist, setUploadArtist] = useState('')
  const [uploadYoutubeUrl, setUploadYoutubeUrl] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Refs
  const audioRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const audioContextRef = useRef(null)
  const ytApiLoaded = useRef(false)
  const fileInputRef = useRef(null)

  // Load songs on mount
  useEffect(() => {
    fetch('/api/songs')
      .then(res => res.json())
      .then(data => setSongs(data.songs || []))
      .catch(() => {
        fetch('/songs/index.json')
          .then(res => res.json())
          .then(data => setSongs(data.songs || []))
          .catch(() => console.log('No se encontro index.json'))
      })
  }, [])

  // Load YouTube IFrame API
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

  const initYouTubePlayer = useCallback((videoId, onEnded) => {
    if (!window.YT || !window.YT.Player) {
      console.error('YouTube API not loaded')
      return
    }

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
          if (event.data === 0 && onEnded) { // YT.PlayerState.ENDED
            onEnded()
          }
        }
      }
    })
  }, [])

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

  const play = useCallback(() => {
    if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(volume * 100)
      ytPlayerRef.current.playVideo()
    } else if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.play()
    }
  }, [selectedSong, volume])

  const pause = useCallback(() => {
    if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.pauseVideo()
    } else if (audioRef.current) {
      audioRef.current.pause()
    }
  }, [selectedSong])

  const seek = useCallback((time) => {
    if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(time)
    } else if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }, [selectedSong])

  const stop = useCallback(() => {
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

    if (customAudioUrl) {
      URL.revokeObjectURL(customAudioUrl)
      setCustomAudioUrl(null)
    }
  }, [customAudioUrl])

  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume)
    if (selectedSong?.type === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(newVolume * 100)
    } else if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }, [selectedSong])

  const loadSong = useCallback(async (song, setGameState, setNotesData) => {
    setSelectedSong(song)
    setGameState('analyzing')

    // YouTube songs
    if (song.type === 'youtube' && song.videoId) {
      try {
        const notesPath = song.notes
        const jsonResponse = await fetch(`${notesPath}?t=${Date.now()}`)

        if (!jsonResponse.ok) {
          throw new Error('No se encontraron las notas')
        }

        const songData = await jsonResponse.json()
        const loadedNotes = songData.notes || songData
        const loadedBpm = songData.bpm || 120

        setBpm(loadedBpm)
        const speed = BASE_NOTE_SPEED * (loadedBpm / BASE_BPM)
        setNoteSpeed(Math.max(2, Math.min(5, speed)))

        setNotesData(loadedNotes)

        initYouTubePlayer(song.videoId, () => setGameState('finished'))
        setGameState('ready')
        return { success: true, fromJson: true }

      } catch (error) {
        console.error('Error cargando cancion YouTube:', error)
        setGameState('idle')
        return { success: false }
      }
    }

    // MP3 songs
    const audioPath = song.audio.startsWith('/') ? song.audio : `/songs/${song.audio}`
    const notesPath = song.notes.startsWith('/') ? song.notes : `/songs/${song.notes}`

    if (audioRef.current) {
      audioRef.current.src = audioPath
    }

    // Try loading notes from JSON
    try {
      const jsonResponse = await fetch(`${notesPath}?t=${Date.now()}`)
      if (jsonResponse.ok) {
        const songData = await jsonResponse.json()
        const loadedNotes = songData.notes || songData
        const loadedBpm = songData.bpm || 120

        setBpm(loadedBpm)
        const speed = BASE_NOTE_SPEED * (loadedBpm / BASE_BPM)
        setNoteSpeed(Math.max(2, Math.min(5, speed)))

        setNotesData(loadedNotes)
        setGameState('ready')
        return { success: true, fromJson: true }
      }
    } catch (e) {
      console.log('No se encontro JSON, analizando audio...')
    }

    // Analyze audio if no JSON
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

      setNotesData(generatedNotes)

      // Download JSON
      const songDataToSave = {
        song: { title: song.title, artist: song.artist, audioFile: song.audio, bpm: detectedBpm },
        notes: generatedNotes,
        bpm: detectedBpm
      }
      downloadJSON(songDataToSave, song.notes)

      setGameState('ready')
      return { success: true, fromJson: false }
    } catch (error) {
      console.error('Error cargando audio:', error)
      setGameState('idle')
      return { success: false }
    }
  }, [initYouTubePlayer])

  const reloadSongs = useCallback(async () => {
    try {
      const res = await fetch('/api/songs')
      if (res.ok) {
        const data = await res.json()
        setSongs(data.songs || [])
      }
    } catch (e) {
      console.log('Error recargando canciones')
    }
  }, [])

  const handleFileUpload = useCallback(async (file, setGameState, setNotesData) => {
    if (!file) return

    const fileName = file.name.replace('.mp3', '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
    const title = uploadTitle.trim() || fileName
    const artist = uploadArtist.trim() || 'Desconocido'

    setUploadLoading(true)
    setUploadError('')
    setGameState('analyzing')

    try {
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
      console.log('Cancion guardada:', result)

      await reloadSongs()

      setUploadTitle('')
      setUploadArtist('')
      setUploadYoutubeUrl('')

      if (result.song) {
        await loadSong(result.song, setGameState, setNotesData)
      }

      alert(`Cancion "${title}" agregada correctamente!`)

    } catch (error) {
      console.error('Error subiendo cancion:', error)
      setUploadError(error.message)
      setGameState('idle')
    } finally {
      setUploadLoading(false)
    }
  }, [uploadTitle, uploadArtist, uploadYoutubeUrl, reloadSongs, loadSong])

  const value = {
    // State
    songs,
    selectedSong,
    volume,
    bpm,
    noteSpeed,
    speedMultiplier,
    customAudioUrl,
    audioOffset,
    ytPlayerReady,
    uploadTitle,
    uploadArtist,
    uploadYoutubeUrl,
    uploadLoading,
    uploadError,

    // Refs
    audioRef,
    ytPlayerRef,
    fileInputRef,

    // Setters
    setSongs,
    setSelectedSong,
    setVolume,
    setBpm,
    setNoteSpeed,
    setSpeedMultiplier,
    setAudioOffset,
    setUploadTitle,
    setUploadArtist,
    setUploadYoutubeUrl,
    setUploadError,

    // Actions
    getCurrentTime,
    play,
    pause,
    seek,
    stop,
    handleVolumeChange,
    loadSong,
    reloadSongs,
    handleFileUpload,
    initYouTubePlayer,
  }

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  )
}

export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider')
  }
  return context
}
