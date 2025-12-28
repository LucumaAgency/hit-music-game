import { useState, useCallback, useEffect } from 'react'
import { LANES } from '../../constants'

function TouchControls({
  gameState,
  isPaused,
  isRecording,
  getCurrentTime,
  findHitNote,
  registerHit,
  recordNote,
  setPressedKeys,
  // Hold notes
  startHold,
  endHold,
  // Recording with hold notes
  recordNoteStart,
  recordNoteEnd,
  // Multiplayer
  sendScoreUpdate,
  isMultiplayer,
  score,
  combo,
  hits,
  misses,
}) {
  // Track pressed state for visual feedback
  const [pressedLanes, setPressedLanes] = useState({})

  const handlePress = useCallback((laneIndex) => {
    // Visual feedback
    setPressedLanes(prev => ({ ...prev, [laneIndex]: true }))

    const key = LANES[laneIndex].key
    setPressedKeys(prev => ({ ...prev, [key]: true }))

    if (gameState !== 'playing' || isPaused) return

    const currentTime = getCurrentTime()

    // Recording mode
    if (isRecording) {
      if (recordNoteStart) {
        recordNoteStart(currentTime, laneIndex)
      } else {
        recordNote(currentTime, laneIndex)
      }
      return
    }

    // Normal mode - check hits
    const hitNote = findHitNote(laneIndex, currentTime)

    if (hitNote) {
      // Check if hold note
      if (hitNote.duration && hitNote.duration > 0 && startHold) {
        startHold(hitNote.id, currentTime)
      } else {
        registerHit(laneIndex, hitNote.id)
      }

      // Send multiplayer update
      if (sendScoreUpdate && isMultiplayer) {
        sendScoreUpdate(score + 100, combo + 1, hits + 1, misses)
      }
    }
  }, [
    gameState,
    isPaused,
    isRecording,
    getCurrentTime,
    findHitNote,
    registerHit,
    recordNote,
    setPressedKeys,
    startHold,
    recordNoteStart,
    sendScoreUpdate,
    isMultiplayer,
    score,
    combo,
    hits,
    misses,
  ])

  const handleRelease = useCallback((laneIndex) => {
    // Visual feedback
    setPressedLanes(prev => ({ ...prev, [laneIndex]: false }))

    const key = LANES[laneIndex].key
    setPressedKeys(prev => ({ ...prev, [key]: false }))

    if (gameState !== 'playing' || isPaused) return

    const currentTime = getCurrentTime()

    // Recording mode - end hold note
    if (isRecording && recordNoteEnd) {
      recordNoteEnd(currentTime, laneIndex)
      return
    }

    // Normal mode - end hold note
    if (endHold) {
      endHold(laneIndex, currentTime)
    }
  }, [
    setPressedKeys,
    gameState,
    isPaused,
    getCurrentTime,
    isRecording,
    recordNoteEnd,
    endHold,
  ])

  // Reset pressed state when game ends
  useEffect(() => {
    if (gameState !== 'playing') {
      setPressedLanes({})
    }
  }, [gameState])

  // Only show during gameplay
  if (gameState !== 'playing' && gameState !== 'paused') {
    return null
  }

  return (
    <div className="touch-controls">
      {LANES.map((lane, index) => (
        <div
          key={index}
          className={`touch-button ${pressedLanes[index] ? 'pressed' : ''}`}
          style={{
            '--lane-color': lane.color,
            backgroundColor: pressedLanes[index] ? lane.color : lane.color + '33',
            borderColor: lane.color,
          }}
          onTouchStart={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handlePress(index)
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleRelease(index)
          }}
          onTouchCancel={(e) => {
            e.preventDefault()
            handleRelease(index)
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            handlePress(index)
          }}
          onMouseUp={(e) => {
            e.preventDefault()
            handleRelease(index)
          }}
          onMouseLeave={() => {
            if (pressedLanes[index]) {
              handleRelease(index)
            }
          }}
        >
          <span className="touch-button-label">{lane.key.toUpperCase()}</span>
        </div>
      ))}
    </div>
  )
}

export default TouchControls
