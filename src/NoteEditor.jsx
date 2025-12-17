const LANES = [
  { key: 'a', color: '#22c55e' },
  { key: 's', color: '#ef4444' },
  { key: 'j', color: '#eab308' },
  { key: 'k', color: '#3b82f6' },
  { key: 'l', color: '#f97316' },
]

function NoteEditor({ notes, onSave, onCancel }) {
  const sortedNotes = [...notes].sort((a, b) => a.time - b.time)

  const formatTime = (t) => {
    const mins = Math.floor(t / 60)
    const secs = Math.floor(t % 60)
    const ms = Math.round((t % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <div className="note-editor">
      <div className="note-editor-header">
        <h2>Editor de Notas</h2>
        <p>{notes.length} notas</p>
      </div>

      <div className="note-list-container">
        <table className="note-list">
          <thead>
            <tr>
              <th>#</th>
              <th>Tiempo</th>
              <th>Carril</th>
            </tr>
          </thead>
          <tbody>
            {sortedNotes.map((note, index) => (
              <tr key={index} className="note-row">
                <td>{index + 1}</td>
                <td className="note-time">{formatTime(note.time)}</td>
                <td>
                  <span
                    className="lane-indicator"
                    style={{ backgroundColor: LANES[note.lane].color }}
                  >
                    {LANES[note.lane].key.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="editor-footer">
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

export default NoteEditor
