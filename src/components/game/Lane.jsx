import { LANES } from '../../constants'

function Lane({
  laneIndex,
  activeNotes,
  currentTime,
  noteSpeed,
  speedMultiplier,
  pressedKeys,
  feedback,
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
