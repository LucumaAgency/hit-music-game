import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { HIT_WINDOW, HOLD_POINTS_PER_TICK, HOLD_COMPLETE_BONUS, MIN_HOLD_DURATION } from '../constants'

const GameContext = createContext(null)

export function GameProvider({ children }) {
  const [gameState, setGameState] = useState('idle') // idle, analyzing, ready, playing, paused, finished, recording-done, lobby
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [notes, setNotes] = useState([])
  const [activeNotes, setActiveNotes] = useState([])
  const [feedback, setFeedback] = useState({})
  const [pressedKeys, setPressedKeys] = useState({})
  const [isPaused, setIsPaused] = useState(false)
  const [loadedFromJson, setLoadedFromJson] = useState(false)
  const [showEditor, setShowEditor] = useState(false)

  // Recording mode
  const [isRecording, setIsRecording] = useState(false)
  const [recordedNotes, setRecordedNotes] = useState([])
  const recordedNotesRef = useRef([])

  // Hold notes state
  const [activeHolds, setActiveHolds] = useState({}) // { noteId: { startTime, lastTickTime } }
  const activeHoldsRef = useRef({})
  const recordingKeyDownTime = useRef({}) // Para grabación: { laneIndex: startTime }

  // Notes reference for game loop (mutable)
  const notesRef = useRef([])

  const resetGame = useCallback(() => {
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setHits(0)
    setMisses(0)
    setActiveNotes([])
    setFeedback({})
    setActiveHolds({})
    activeHoldsRef.current = {}
    notesRef.current = notesRef.current.map(n => ({ ...n, hit: false, missed: false }))
  }, [])

  // Iniciar hold note
  const startHold = useCallback((noteId, currentTime) => {
    const note = notesRef.current.find(n => n.id === noteId)
    if (!note || !note.duration) return false

    activeHoldsRef.current[noteId] = {
      startTime: currentTime,
      lastTickTime: currentTime,
      note
    }
    setActiveHolds({ ...activeHoldsRef.current })
    return true
  }, [])

  // Terminar hold note (cuando suelta la tecla)
  const endHold = useCallback((laneIndex, currentTime) => {
    // Buscar hold activa en este carril
    const holdEntry = Object.entries(activeHoldsRef.current).find(
      ([_, hold]) => hold.note.lane === laneIndex
    )

    if (!holdEntry) return

    const [noteId, hold] = holdEntry
    const note = hold.note
    const holdEndTime = note.time + note.duration

    // Verificar si completó la hold note
    if (currentTime >= holdEndTime - HIT_WINDOW) {
      // Completó! Bonus + marcar como hit
      note.hit = true
      setScore(s => s + HOLD_COMPLETE_BONUS)
      setHits(h => h + 1)
      setCombo(c => {
        const newCombo = c + 1
        setMaxCombo(max => Math.max(max, newCombo))
        return newCombo
      })
      setFeedback(prev => ({ ...prev, [laneIndex]: { type: 'hit', time: Date.now() } }))
    }
    // Si soltó antes, no rompe combo pero no da bonus (estilo DDR)

    delete activeHoldsRef.current[noteId]
    setActiveHolds({ ...activeHoldsRef.current })
  }, [])

  // Procesar ticks de puntos para hold notes activas
  const processHoldTicks = useCallback((currentTime) => {
    let pointsEarned = 0

    Object.entries(activeHoldsRef.current).forEach(([noteId, hold]) => {
      const timeSinceLastTick = currentTime - hold.lastTickTime

      if (timeSinceLastTick >= 0.1) { // Cada 100ms
        const ticks = Math.floor(timeSinceLastTick / 0.1)
        pointsEarned += HOLD_POINTS_PER_TICK * ticks
        activeHoldsRef.current[noteId].lastTickTime = currentTime
      }
    })

    if (pointsEarned > 0) {
      setScore(s => s + pointsEarned)
      setActiveHolds({ ...activeHoldsRef.current })
    }

    return pointsEarned
  }, [])

  // Verificar hold notes que expiraron (usuario no soltó la tecla pero la nota terminó)
  const checkHoldExpiration = useCallback((currentTime) => {
    Object.entries(activeHoldsRef.current).forEach(([noteId, hold]) => {
      const note = hold.note
      const holdEndTime = note.time + note.duration

      if (currentTime > holdEndTime) {
        // La hold note terminó mientras mantenía la tecla - completado!
        note.hit = true
        setScore(s => s + HOLD_COMPLETE_BONUS)
        setHits(h => h + 1)
        setCombo(c => {
          const newCombo = c + 1
          setMaxCombo(max => Math.max(max, newCombo))
          return newCombo
        })
        setFeedback(prev => ({ ...prev, [note.lane]: { type: 'hit', time: Date.now() } }))

        delete activeHoldsRef.current[noteId]
        setActiveHolds({ ...activeHoldsRef.current })
      }
    })
  }, [])

  const registerHit = useCallback((laneIndex, noteId) => {
    const note = notesRef.current.find(n => n.id === noteId)
    if (note) {
      note.hit = true
    }

    setHits(h => h + 1)
    setCombo(c => {
      const newCombo = c + 1
      setMaxCombo(max => Math.max(max, newCombo))
      setScore(s => s + 100 * (1 + Math.floor(newCombo / 10)))
      return newCombo
    })
    setFeedback(prev => ({ ...prev, [laneIndex]: { type: 'hit', time: Date.now() } }))
  }, [])

  const registerMiss = useCallback((laneIndex, noteId) => {
    const note = notesRef.current.find(n => n.id === noteId)
    if (note) {
      note.missed = true
    }

    setMisses(m => m + 1)
    setCombo(0)
    setFeedback(prev => ({ ...prev, [laneIndex]: { type: 'miss', time: Date.now() } }))
  }, [])

  const setNotesData = useCallback((newNotes) => {
    setNotes(newNotes)
    notesRef.current = newNotes.map((n, i) => ({ ...n, id: i, hit: false, missed: false }))
  }, [])

  const findHitNote = useCallback((laneIndex, currentTime) => {
    return notesRef.current.find(note =>
      note.lane === laneIndex &&
      !note.hit &&
      !note.missed &&
      Math.abs(note.time - currentTime) <= HIT_WINDOW
    )
  }, [])

  // Grabación: Inicio de nota (keydown)
  const recordNoteStart = useCallback((time, laneIndex) => {
    recordingKeyDownTime.current[laneIndex] = time
    setFeedback(prev => ({ ...prev, [laneIndex]: { type: 'hit', time: Date.now() } }))
  }, [])

  // Grabación: Fin de nota (keyup) - calcula duración
  const recordNoteEnd = useCallback((time, laneIndex) => {
    const startTime = recordingKeyDownTime.current[laneIndex]
    if (startTime === undefined) return

    const duration = time - startTime
    const newNote = {
      time: Math.round(startTime * 1000) / 1000,
      lane: laneIndex
    }

    // Si la duración es mayor al mínimo, es una hold note
    if (duration >= MIN_HOLD_DURATION) {
      newNote.duration = Math.round(duration * 1000) / 1000
    }

    recordedNotesRef.current.push(newNote)
    delete recordingKeyDownTime.current[laneIndex]
  }, [])

  // Mantener compatibilidad con recordNote original (para notas simples)
  const recordNote = useCallback((time, laneIndex) => {
    const newNote = {
      time: Math.round(time * 1000) / 1000,
      lane: laneIndex
    }
    recordedNotesRef.current.push(newNote)
    setFeedback(prev => ({ ...prev, [laneIndex]: { type: 'hit', time: Date.now() } }))
  }, [])

  const value = {
    // State
    gameState,
    score,
    combo,
    maxCombo,
    hits,
    misses,
    notes,
    activeNotes,
    feedback,
    pressedKeys,
    isPaused,
    loadedFromJson,
    showEditor,
    isRecording,
    recordedNotes,
    activeHolds,

    // Refs
    notesRef,
    recordedNotesRef,

    // Setters
    setGameState,
    setScore,
    setCombo,
    setActiveNotes,
    setFeedback,
    setPressedKeys,
    setIsPaused,
    setLoadedFromJson,
    setShowEditor,
    setIsRecording,
    setRecordedNotes,
    setNotesData,

    // Actions
    resetGame,
    registerHit,
    registerMiss,
    findHitNote,
    recordNote,
    // Hold notes
    startHold,
    endHold,
    processHoldTicks,
    checkHoldExpiration,
    // Recording with hold notes
    recordNoteStart,
    recordNoteEnd,
  }

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
