import { useEffect, useRef, useCallback } from 'react'
import { HIT_WINDOW } from '../constants'

export function useGameLoop({
  gameState,
  isPaused,
  notesRef,
  noteSpeed,
  speedMultiplier,
  getCurrentTime,
  setActiveNotes,
  registerMiss,
  onGameEnd,
  selectedSong,
  ytPlayerRef,
  audioRef,
  // Hold notes
  processHoldTicks,
  checkHoldExpiration,
}) {
  const animationRef = useRef(null)

  const gameLoop = useCallback(() => {
    const isYouTube = selectedSong?.type === 'youtube'
    if (!isYouTube && !audioRef?.current) return
    if (isYouTube && !ytPlayerRef?.current) return

    const currentTime = getCurrentTime()
    const effectiveSpeed = noteSpeed / (1 + (speedMultiplier - 1) * 0.5)

    // Procesar ticks de hold notes activas
    if (processHoldTicks) {
      processHoldTicks(currentTime)
    }

    // Verificar hold notes que terminaron por tiempo
    if (checkHoldExpiration) {
      checkHoldExpiration(currentTime)
    }

    // Find visible notes (incluir hold notes por su duración completa)
    const visibleNotes = notesRef.current.filter(note => {
      const noteScreenTime = note.time - currentTime
      // Para hold notes, considerar el tiempo de finalización
      const noteEndTime = note.duration ? note.time + note.duration : note.time
      const noteEndScreenTime = noteEndTime - currentTime
      return noteScreenTime <= effectiveSpeed && noteEndScreenTime >= -0.5 && !note.hit
    })

    // Check for missed notes (no marcar miss las hold notes que están siendo procesadas)
    notesRef.current.forEach(note => {
      if (!note.hit && !note.missed) {
        // Para hold notes, el miss ocurre si no presionó al inicio
        const missTime = note.duration
          ? note.time + HIT_WINDOW  // Hold notes: miss si no inició a tiempo
          : note.time + HIT_WINDOW  // Notas normales: miss después de HIT_WINDOW

        if (currentTime > missTime) {
          registerMiss(note.lane, note.id)
        }
      }
    })

    setActiveNotes([...visibleNotes])

    // Check if ended
    const isEnded = isYouTube
      ? (ytPlayerRef.current?.getPlayerState?.() === 0)
      : audioRef.current?.ended

    if (isEnded) {
      if (onGameEnd) onGameEnd()
      return
    }

    animationRef.current = requestAnimationFrame(gameLoop)
  }, [
    noteSpeed,
    speedMultiplier,
    getCurrentTime,
    setActiveNotes,
    registerMiss,
    onGameEnd,
    selectedSong,
    ytPlayerRef,
    audioRef,
    notesRef,
    processHoldTicks,
    checkHoldExpiration,
  ])

  useEffect(() => {
    if (gameState === 'playing' && !isPaused) {
      animationRef.current = requestAnimationFrame(gameLoop)
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [gameState, gameLoop, isPaused])

  return { animationRef }
}
