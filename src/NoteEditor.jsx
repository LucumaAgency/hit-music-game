import { useState, useEffect, useRef } from 'react'

const LANES = [
  { key: 'a', color: '#22c55e' },
  { key: 's', color: '#ef4444' },
  { key: 'j', color: '#eab308' },
  { key: 'k', color: '#3b82f6' },
  { key: 'l', color: '#f97316' },
]

function NoteEditor({ notes, song, audioRef, ytPlayerRef, onSave, onCancel }) {
  const [editedNotes, setEditedNotes] = useState(
    [...notes].sort((a, b) => a.time - b.time)
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const animationRef = useRef(null)

  // Actualizar tiempo actual durante reproducción
  useEffect(() => {
    if (!isPlaying) return

    const updateTime = () => {
      let time = 0
      if (song?.type === 'youtube' && ytPlayerRef?.current) {
        try {
          time = ytPlayerRef.current.getCurrentTime() || 0
        } catch (e) {}
      } else if (audioRef?.current) {
        time = audioRef.current.currentTime || 0
      }
      setCurrentTime(time)
      animationRef.current = requestAnimationFrame(updateTime)
    }

    animationRef.current = requestAnimationFrame(updateTime)
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, song, audioRef, ytPlayerRef])

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      // Pausar audio al salir
      if (song?.type === 'youtube' && ytPlayerRef?.current) {
        try { ytPlayerRef.current.pauseVideo() } catch (e) {}
      } else if (audioRef?.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const formatTime = (t) => {
    const mins = Math.floor(t / 60)
    const secs = Math.floor(t % 60)
    const ms = Math.round((t % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  const togglePlay = () => {
    if (isPlaying) {
      if (song?.type === 'youtube' && ytPlayerRef?.current) {
        ytPlayerRef.current.pauseVideo()
      } else if (audioRef?.current) {
        audioRef.current.pause()
      }
      setIsPlaying(false)
    } else {
      if (song?.type === 'youtube' && ytPlayerRef?.current) {
        ytPlayerRef.current.playVideo()
      } else if (audioRef?.current) {
        audioRef.current.play()
      }
      setIsPlaying(true)
    }
  }

  const seekTo = (time) => {
    if (song?.type === 'youtube' && ytPlayerRef?.current) {
      ytPlayerRef.current.seekTo(time, true)
    } else if (audioRef?.current) {
      audioRef.current.currentTime = time
    }
    setCurrentTime(time)
  }

  const deleteNote = (index) => {
    const newNotes = editedNotes.filter((_, i) => i !== index)
    setEditedNotes(newNotes)
  }

  const adjustTime = (index, delta) => {
    const newNotes = [...editedNotes]
    newNotes[index] = {
      ...newNotes[index],
      time: Math.max(0, Math.round((newNotes[index].time + delta) * 1000) / 1000)
    }
    newNotes.sort((a, b) => a.time - b.time)
    setEditedNotes(newNotes)
  }

  const handleSave = () => {
    // Pausar antes de guardar
    if (isPlaying) {
      if (song?.type === 'youtube' && ytPlayerRef?.current) {
        ytPlayerRef.current.pauseVideo()
      } else if (audioRef?.current) {
        audioRef.current.pause()
      }
      setIsPlaying(false)
    }
    onSave(editedNotes)
  }

  const handleCancel = () => {
    // Pausar antes de cancelar
    if (isPlaying) {
      if (song?.type === 'youtube' && ytPlayerRef?.current) {
        ytPlayerRef.current.pauseVideo()
      } else if (audioRef?.current) {
        audioRef.current.pause()
      }
      setIsPlaying(false)
    }
    onCancel()
  }

  return (
    <div className="note-editor">
      <div className="note-editor-header">
        <h2>Editor de Notas</h2>
        <p>{editedNotes.length} notas</p>
      </div>

      <div className="editor-controls">
        <button className="play-btn" onClick={togglePlay}>
          {isPlaying ? '⏸ Pausar' : '▶ Reproducir'}
        </button>
        <button className="seek-btn" onClick={() => seekTo(0)}>
          ⏮ Inicio
        </button>
        <span className="current-time">{formatTime(currentTime)}</span>
      </div>

      <div className="note-list-container">
        <table className="note-list">
          <thead>
            <tr>
              <th>#</th>
              <th>Tiempo</th>
              <th>Carril</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {editedNotes.map((note, index) => {
              const isNear = Math.abs(note.time - currentTime) < 0.3
              return (
                <tr
                  key={index}
                  className={`note-row ${isNear ? 'note-current' : ''}`}
                >
                  <td>{index + 1}</td>
                  <td className="note-time-cell">
                    <button
                      className="time-btn"
                      onClick={() => adjustTime(index, -0.1)}
                    >-</button>
                    <span
                      className="note-time clickable"
                      onClick={() => seekTo(note.time)}
                    >
                      {formatTime(note.time)}
                    </span>
                    <button
                      className="time-btn"
                      onClick={() => adjustTime(index, 0.1)}
                    >+</button>
                  </td>
                  <td>
                    <span
                      className="lane-indicator"
                      style={{ backgroundColor: LANES[note.lane].color }}
                    >
                      {LANES[note.lane].key.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <button
                      className="delete-btn"
                      onClick={() => deleteNote(index)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="editor-footer">
        <button className="save-btn" onClick={handleSave}>Guardar</button>
        <button onClick={handleCancel}>Cancelar</button>
      </div>
    </div>
  )
}

export default NoteEditor
