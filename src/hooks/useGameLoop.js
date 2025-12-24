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
}) {
  const animationRef = useRef(null)

  const gameLoop = useCallback(() => {
    const isYouTube = selectedSong?.type === 'youtube'
    if (!isYouTube && !audioRef?.current) return
    if (isYouTube && !ytPlayerRef?.current) return

    const currentTime = getCurrentTime()
    const effectiveSpeed = noteSpeed / (1 + (speedMultiplier - 1) * 0.5)

    // Find visible notes
    const visibleNotes = notesRef.current.filter(note => {
      const noteScreenTime = note.time - currentTime
      return noteScreenTime <= effectiveSpeed && noteScreenTime >= -0.5 && !note.hit
    })

    // Check for missed notes
    notesRef.current.forEach(note => {
      if (!note.hit && !note.missed && currentTime > note.time + HIT_WINDOW) {
        registerMiss(note.lane, note.id)
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
