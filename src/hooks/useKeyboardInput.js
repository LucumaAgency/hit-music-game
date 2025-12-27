import { useEffect, useCallback } from 'react'
import { LANES } from '../constants'

export function useKeyboardInput({
  gameState,
  isPaused,
  isRecording,
  getCurrentTime,
  findHitNote,
  registerHit,
  recordNote,
  setPressedKeys,
  togglePause,
  onEscape,
  sendScoreUpdate,
  isMultiplayer,
  score,
  combo,
  hits,
  misses,
  // Hold notes
  startHold,
  endHold,
  // Recording with hold notes
  recordNoteStart,
  recordNoteEnd,
}) {
  const handleKeyDown = useCallback((e) => {
    const key = e.key.toLowerCase()

    if (key === 'p') {
      togglePause()
      return
    }

    if (key === 'escape') {
      onEscape()
      return
    }

    const laneIndex = LANES.findIndex(l => l.key === key)
    if (laneIndex === -1) return
    if (e.repeat) return

    setPressedKeys(prev => ({ ...prev, [key]: true }))

    if (gameState !== 'playing' || isPaused) return

    const currentTime = getCurrentTime()

    // Recording mode - usa keydown para iniciar
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
      // Verificar si es hold note
      if (hitNote.duration && hitNote.duration > 0 && startHold) {
        // Iniciar hold note
        startHold(hitNote.id, currentTime)
      } else {
        // Nota normal
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
    togglePause,
    onEscape,
    sendScoreUpdate,
    isMultiplayer,
    score,
    combo,
    hits,
    misses,
    startHold,
    recordNoteStart,
  ])

  const handleKeyUp = useCallback((e) => {
    const key = e.key.toLowerCase()
    const laneIndex = LANES.findIndex(l => l.key === key)

    setPressedKeys(prev => ({ ...prev, [key]: false }))

    if (gameState !== 'playing' || isPaused) return

    const currentTime = getCurrentTime()

    // Recording mode - usa keyup para terminar
    if (isRecording && recordNoteEnd && laneIndex !== -1) {
      recordNoteEnd(currentTime, laneIndex)
      return
    }

    // Normal mode - terminar hold note si hay una activa
    if (endHold && laneIndex !== -1) {
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

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])
}
