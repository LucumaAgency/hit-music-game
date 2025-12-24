import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { HIT_WINDOW } from '../constants'

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
    notesRef.current = notesRef.current.map(n => ({ ...n, hit: false, missed: false }))
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
