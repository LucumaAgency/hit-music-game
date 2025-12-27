import { LANES } from '../../constants'

function Lane({
  laneIndex,
  activeNotes,
  currentTime,
  noteSpeed,
  speedMultiplier,
  pressedKeys,
  feedback,
  activeHolds = {},
}) {
  const lane = LANES[laneIndex]
  const effectiveSpeed = noteSpeed / (1 + (speedMultiplier - 1) * 0.5)

  const laneNotes = activeNotes.filter(note => note.lane === laneIndex)

  return (
    <div className="lane">
      {laneNotes.map(note => {
        const noteScreenTime = note.time - currentTime
        const progress = 1 - (noteScreenTime / effectiveSpeed)
        const top = progress * 85

        // Verificar si es una hold note
        const isHoldNote = note.duration && note.duration > 0
        const isBeingHeld = activeHolds[note.id]

        if (isHoldNote) {
          // Calcular altura de la barra basada en duración
          const durationInScreen = (note.duration / effectiveSpeed) * 85
          const holdEndTime = note.time + note.duration

          // Calcular progreso de la hold note si está siendo presionada
          let holdProgress = 0
          if (isBeingHeld && currentTime >= note.time) {
            holdProgress = Math.min(1, (currentTime - note.time) / note.duration)
          }

          // Si ya pasó completamente, no renderizar
          if (currentTime > holdEndTime + 0.1) return null

          return (
            <div key={note.id} className="hold-note-container" style={{ opacity: note.hit ? 0 : 1 }}>
              {/* Barra de la hold note */}
              <div
                className={`hold-note-bar ${isBeingHeld ? 'active' : ''}`}
                style={{
                  top: `${top - durationInScreen}%`,
                  height: `${durationInScreen}%`,
                  backgroundColor: isBeingHeld ? lane.color : `${lane.color}66`,
                  borderColor: lane.color,
                }}
              >
                {/* Progreso completado */}
                {isBeingHeld && holdProgress > 0 && (
                  <div
                    className="hold-note-progress"
                    style={{
                      height: `${holdProgress * 100}%`,
                      backgroundColor: lane.color,
                    }}
                  />
                )}
              </div>
              {/* Cabeza de la nota (círculo) */}
              <div
                className="note hold-note-head"
                style={{
                  top: `${top}%`,
                  backgroundColor: lane.color,
                  boxShadow: `0 0 15px ${lane.color}`,
                }}
              />
            </div>
          )
        }

        // Nota normal
        return (
          <div
            key={note.id}
            className="note"
            style={{
              top: `${top}%`,
              backgroundColor: lane.color,
              boxShadow: `0 0 15px ${lane.color}`,
              opacity: note.hit ? 0 : 1,
            }}
          />
        )
      })}

      <div
        className={`hit-zone ${pressedKeys[lane.key] ? 'pressed' : ''}`}
        style={{
          borderColor: lane.color,
          backgroundColor: pressedKeys[lane.key] ? lane.color : 'transparent',
          boxShadow: pressedKeys[lane.key] ? `0 0 30px ${lane.color}` : 'none'
        }}
      >
        <span className="key-label">{lane.key.toUpperCase()}</span>
      </div>

      {feedback[laneIndex] && Date.now() - feedback[laneIndex].time < 300 && (
        <div className={`feedback ${feedback[laneIndex].type}`}>
          {feedback[laneIndex].type === 'hit' ? 'HIT!' : 'MISS'}
        </div>
      )}
    </div>
  )
}

export default Lane
