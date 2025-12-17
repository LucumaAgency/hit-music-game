import { useState } from 'react'

const LANES = [
  { key: 'a', color: '#22c55e' },
  { key: 's', color: '#ef4444' },
  { key: 'j', color: '#eab308' },
  { key: 'k', color: '#3b82f6' },
  { key: 'l', color: '#f97316' },
]

function NoteEditor({ notes, onSave, onCancel }) {
  const [editedNotes, setEditedNotes] = useState(
    [...notes].sort((a, b) => a.time - b.time)
  )

  const formatTime = (t) => {
    const mins = Math.floor(t / 60)
    const secs = Math.floor(t % 60)
    const ms = Math.round((t % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
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
    onSave(editedNotes)
  }

  return (
    <div className="note-editor">
      <div className="note-editor-header">
        <h2>Editor de Notas</h2>
        <p>{editedNotes.length} notas</p>
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
            {editedNotes.map((note, index) => (
              <tr key={index} className="note-row">
                <td>{index + 1}</td>
                <td className="note-time-cell">
                  <button
                    className="time-btn"
                    onClick={() => adjustTime(index, -0.1)}
                  >-</button>
                  <span className="note-time">{formatTime(note.time)}</span>
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
            ))}
          </tbody>
        </table>
      </div>

      <div className="editor-footer">
        <button className="save-btn" onClick={handleSave}>Guardar</button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

export default NoteEditor
