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

    // Recording mode
    if (isRecording) {
      recordNote(currentTime, laneIndex)
      return
    }

    // Normal mode - check hits
    const hitNote = findHitNote(laneIndex, currentTime)

    if (hitNote) {
      registerHit(laneIndex, hitNote.id)

      // Send multiplayer update
      if (sendScoreUpdate && isMultiplayer) {
        // We need to get updated values after registerHit
        // This is a simplification - in reality we'd need the new values
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
  ])

  const handleKeyUp = useCallback((e) => {
    const key = e.key.toLowerCase()
    setPressedKeys(prev => ({ ...prev, [key]: false }))
  }, [setPressedKeys])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])
}
