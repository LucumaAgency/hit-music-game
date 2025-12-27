import { useEffect, useCallback } from 'react'
import './App.css'

// Contexts
import { GameProvider, useGame } from './contexts/GameContext'
import { AudioProvider, useAudio } from './contexts/AudioContext'
import { MultiplayerProvider, useMultiplayer } from './contexts/MultiplayerContext'

// Hooks
import { useGameLoop } from './hooks/useGameLoop'
import { useKeyboardInput } from './hooks/useKeyboardInput'

// Components
import Header from './components/ui/Header'
import HomeScreen from './components/screens/HomeScreen'
import PreGameScreen from './components/screens/PreGameScreen'
import ResultsScreen from './components/screens/ResultsScreen'
import PauseMenu from './components/screens/PauseMenu'
import RecordingDoneScreen from './components/screens/RecordingDoneScreen'
import MultiplayerMenu from './components/multiplayer/MultiplayerMenu'
import MultiplayerLobby from './components/multiplayer/MultiplayerLobby'
import GameArea from './components/game/GameArea'
import NoteEditor from './components/NoteEditor'

import { downloadJSON } from './utils/helpers'

function AppContent() {
  const game = useGame()
  const audio = useAudio()
  const multiplayer = useMultiplayer()

  const {
    gameState, setGameState,
    score, combo, hits, misses, maxCombo,
    notes, notesRef, activeNotes,
    isPaused, setIsPaused,
    isRecording, setIsRecording,
    recordedNotes, setRecordedNotes, recordedNotesRef,
    showEditor, setShowEditor,
    setNotesData, setLoadedFromJson,
    resetGame, registerMiss, findHitNote, registerHit, recordNote,
    setPressedKeys,
    // Hold notes
    startHold, endHold, processHoldTicks, checkHoldExpiration,
    recordNoteStart, recordNoteEnd,
  } = game

  const {
    selectedSong, setSelectedSong,
    bpm,
    noteSpeed, speedMultiplier,
    audioRef, ytPlayerRef,
    getCurrentTime, play, pause, seek, stop,
    reloadSongs,
  } = audio

  const {
    isMultiplayer,
    showMultiplayerMenu,
    countdown, setCountdown,
    resumeCountdown, setResumeCountdown,
    pendingSongLoad, setPendingSongLoad,
    isHost,
    sendScoreUpdate, sendGameFinished,
    exitMultiplayer,
  } = multiplayer

  // Game end handler
  const handleGameEnd = useCallback(() => {
    if (isMultiplayer) {
      sendGameFinished(score, hits, misses, maxCombo, notesRef.current.length)
    }
    setGameState('finished')
  }, [isMultiplayer, score, hits, misses, maxCombo, sendGameFinished, setGameState, notesRef])

  // Game loop
  useGameLoop({
    gameState,
    isPaused,
    notesRef,
    noteSpeed,
    speedMultiplier,
    getCurrentTime,
    setActiveNotes: game.setActiveNotes,
    registerMiss,
    onGameEnd: handleGameEnd,
    selectedSong,
    ytPlayerRef,
    audioRef,
    // Hold notes
    processHoldTicks,
    checkHoldExpiration,
  })

  // Toggle pause
  const togglePause = useCallback(() => {
    if (gameState !== 'playing' && gameState !== 'paused') return

    if (isPaused) {
      setResumeCountdown(1)
    } else {
      pause()
      setIsPaused(true)
      setGameState('paused')
    }
  }, [gameState, isPaused, pause, setIsPaused, setGameState, setResumeCountdown])

  // Escape handler
  const handleEscape = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      backToMenu()
    }
  }, [isRecording])

  // Keyboard input
  useKeyboardInput({
    gameState,
    isPaused,
    isRecording,
    getCurrentTime,
    findHitNote,
    registerHit,
    recordNote,
    setPressedKeys,
    togglePause,
    onEscape: handleEscape,
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
  })

  // Guest auto-load song
  useEffect(() => {
    if (pendingSongLoad && isMultiplayer && !isHost) {
      audio.loadSong(pendingSongLoad, setGameState, setNotesData).then(result => {
        if (result?.success) setLoadedFromJson(result.fromJson)
      })
      setPendingSongLoad(null)
    }
  }, [pendingSongLoad, isMultiplayer, isHost])

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      startGame()
      return
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // Resume countdown
  useEffect(() => {
    if (resumeCountdown === null) return
    if (resumeCountdown === 0) {
      setResumeCountdown(null)
      play()
      setIsPaused(false)
      setGameState('playing')
      return
    }
    const timer = setTimeout(() => setResumeCountdown(resumeCountdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resumeCountdown])

  // Start game
  const startGame = useCallback(() => {
    if (gameState !== 'ready' && gameState !== 'finished') return

    resetGame()
    seek(0)
    play()
    setIsPaused(false)
    setIsRecording(false)
    setGameState('playing')
  }, [gameState, resetGame, seek, play, setIsPaused, setIsRecording, setGameState])

  // Start recording
  const startRecording = useCallback(() => {
    if (gameState !== 'ready' && gameState !== 'finished') return

    setRecordedNotes([])
    recordedNotesRef.current = []
    game.setActiveNotes([])
    game.setFeedback({})

    seek(0)
    play()
    setIsPaused(false)
    setIsRecording(true)
    setGameState('playing')
  }, [gameState, seek, play, setIsPaused, setIsRecording, setGameState, setRecordedNotes, recordedNotesRef])

  // Stop recording
  const stopRecording = useCallback(() => {
    pause()
    setRecordedNotes([...recordedNotesRef.current])
    setIsRecording(false)
    setGameState('recording-done')
  }, [pause, setRecordedNotes, recordedNotesRef, setIsRecording, setGameState])

  // Save recorded notes
  const saveRecordedNotes = useCallback(async () => {
    if (recordedNotes.length === 0) {
      alert('No hay notas grabadas')
      return
    }

    try {
      const notesData = {
        song: { title: selectedSong.title, artist: selectedSong.artist, bpm },
        notes: recordedNotes.sort((a, b) => a.time - b.time),
        bpm,
      }

      const response = await fetch('/api/save-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: selectedSong.id, notesData })
      })

      if (response.ok) {
        alert(`${recordedNotes.length} notas guardadas!`)
        setNotesData(recordedNotes)
        setLoadedFromJson(true)
        setGameState('ready')
      } else {
        throw new Error('Error guardando notas')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error guardando notas. Descargando JSON...')
      const notesData = {
        song: { title: selectedSong.title, artist: selectedSong.artist, bpm },
        notes: recordedNotes.sort((a, b) => a.time - b.time),
        bpm,
      }
      downloadJSON(notesData, `${selectedSong.id || 'recorded'}-notes.json`)
    }
  }, [recordedNotes, selectedSong, bpm, setNotesData, setLoadedFromJson, setGameState])

  // Back to menu
  const backToMenu = useCallback(async () => {
    stop()
    setSelectedSong(null)
    setGameState('idle')
    setNotesData([])
    game.setActiveNotes([])
    await reloadSongs()
  }, [stop, setSelectedSong, setGameState, setNotesData, reloadSongs])

  // Exit multiplayer wrapper
  const handleExitMultiplayer = useCallback(() => {
    exitMultiplayer(setGameState)
  }, [exitMultiplayer, setGameState])

  // Editor save handler
  const handleEditorSave = useCallback((editedNotes) => {
    if (gameState === 'recording-done') {
      setRecordedNotes(editedNotes)
    } else {
      setNotesData(editedNotes)
    }
    setShowEditor(false)
  }, [gameState, setRecordedNotes, setNotesData, setShowEditor])

  return (
    <div className="app">
      <audio ref={audioRef} />

      {/* YouTube Player Container */}
      <div
        id="youtube-player-container"
        className={`youtube-player-container ${selectedSong?.type === 'youtube' && (gameState === 'playing' || gameState === 'paused') ? 'visible' : ''}`}
      >
        <div id="youtube-player"></div>
      </div>

      <Header />

      {/* Home Screen */}
      {gameState === 'idle' && !selectedSong && !isMultiplayer && !showMultiplayerMenu && (
        <HomeScreen />
      )}

      {/* Multiplayer Menu */}
      {showMultiplayerMenu && !isMultiplayer && (
        <MultiplayerMenu />
      )}

      {/* Multiplayer Lobby */}
      {(['lobby', 'analyzing', 'ready'].includes(gameState)) && isMultiplayer && (
        <MultiplayerLobby onExitMultiplayer={handleExitMultiplayer} />
      )}

      {/* Analyzing */}
      {gameState === 'analyzing' && !isMultiplayer && (
        <div className="menu">
          <h2>Analizando audio...</h2>
          <div className="loader"></div>
        </div>
      )}

      {/* Pre-game Screen */}
      {gameState === 'ready' && !isMultiplayer && !showEditor && (
        <PreGameScreen
          onStartGame={startGame}
          onStartRecording={startRecording}
          onBackToMenu={backToMenu}
        />
      )}

      {/* Recording Done Screen */}
      {gameState === 'recording-done' && !showEditor && (
        <RecordingDoneScreen
          onSaveNotes={saveRecordedNotes}
          onStartRecording={startRecording}
          onBackToMenu={backToMenu}
        />
      )}

      {/* Note Editor */}
      {showEditor && (
        <NoteEditor
          notes={gameState === 'recording-done' ? recordedNotes : notes}
          song={selectedSong}
          audioRef={audioRef}
          ytPlayerRef={ytPlayerRef}
          onSave={handleEditorSave}
          onCancel={() => setShowEditor(false)}
        />
      )}

      {/* Pause Menu */}
      {gameState === 'paused' && (
        <PauseMenu
          onResume={togglePause}
          onBackToMenu={backToMenu}
        />
      )}

      {/* Results Screen */}
      {gameState === 'finished' && (
        <ResultsScreen
          onPlayAgain={startGame}
          onBackToMenu={backToMenu}
          onExitMultiplayer={handleExitMultiplayer}
        />
      )}

      {/* Game Area */}
      <GameArea />
    </div>
  )
}

function App() {
  return (
    <GameProvider>
      <AudioProvider>
        <MultiplayerProvider>
          <AppContent />
        </MultiplayerProvider>
      </AudioProvider>
    </GameProvider>
  )
}

export default App
