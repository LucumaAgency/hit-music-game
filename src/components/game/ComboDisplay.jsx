function ComboDisplay({ combo, isRecording, recordedNotesCount }) {
  if (isRecording) {
    return (
      <div className="recording-indicator">
        <span className="rec-dot">&#9210;</span>
        <span className="rec-text">GRABANDO</span>
        <span className="rec-count">{recordedNotesCount} notas</span>
        <span className="rec-hint">ESC para terminar</span>
      </div>
    )
  }

  if (combo > 0) {
    return (
      <div className="combo-display">
        <span className="combo-number">{combo}</span>
        <span className="combo-label">COMBO</span>
      </div>
    )
  }

  return null
}

export default ComboDisplay
