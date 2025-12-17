function NoteEditor({ notes, onSave, onCancel }) {
  return (
    <div className="note-editor">
      <h2>Editor de Notas</h2>
      <p>{notes.length} notas</p>
      <div className="editor-footer">
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

export default NoteEditor
