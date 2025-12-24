import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const MultiplayerContext = createContext(null)

export function MultiplayerProvider({ children }) {
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [showMultiplayerMenu, setShowMultiplayerMenu] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [roomInput, setRoomInput] = useState('')
  const [opponent, setOpponent] = useState(null)
  const [opponentScore, setOpponentScore] = useState(0)
  const [opponentCombo, setOpponentCombo] = useState(0)
  const [isHost, setIsHost] = useState(false)
  const [bothReady, setBothReady] = useState({ host: false, guest: false })
  const [countdown, setCountdown] = useState(null)
  const [resumeCountdown, setResumeCountdown] = useState(null)
  const [opponentFinished, setOpponentFinished] = useState(null)
  const [multiplayerError, setMultiplayerError] = useState('')
  const [pendingSongLoad, setPendingSongLoad] = useState(null)

  const socketRef = useRef(null)

  const initSocket = useCallback((setGameState, setSelectedSong) => {
    if (socketRef.current) return socketRef.current

    const newSocket = io(window.location.origin)
    socketRef.current = newSocket

    newSocket.on('roomCreated', ({ roomCode }) => {
      console.log('Sala creada:', roomCode)
      setRoomCode(roomCode)
      setIsHost(true)
      setGameState('lobby')
    })

    newSocket.on('joinedRoom', ({ roomCode, hostName }) => {
      console.log('Unido a sala:', roomCode)
      setRoomCode(roomCode)
      setOpponent(hostName)
      setIsHost(false)
      setGameState('lobby')
    })

    newSocket.on('playerJoined', ({ guestName }) => {
      console.log('Jugador unido:', guestName)
      setOpponent(guestName)
    })

    newSocket.on('error', (msg) => {
      console.log('Error:', msg)
      setMultiplayerError(msg)
    })

    newSocket.on('songSelected', (song) => {
      setSelectedSong(song)
      setPendingSongLoad(song)
    })

    newSocket.on('readyUpdate', ({ hostReady, guestReady }) => {
      setBothReady({ host: hostReady, guest: guestReady })
    })

    newSocket.on('startCountdown', () => {
      setCountdown(3)
    })

    newSocket.on('opponentUpdate', ({ score, combo }) => {
      setOpponentScore(score)
      setOpponentCombo(combo)
    })

    newSocket.on('opponentFinished', (data) => {
      setOpponentFinished(data)
    })

    newSocket.on('playerDisconnected', () => {
      setMultiplayerError('El oponente se desconecto')
      setOpponent(null)
    })

    return newSocket
  }, [])

  const createRoom = useCallback((setGameState, setSelectedSong) => {
    if (!playerName.trim()) {
      setMultiplayerError('Ingresa tu nombre')
      return
    }
    setMultiplayerError('')
    setIsMultiplayer(true)
    const socket = initSocket(setGameState, setSelectedSong)
    socket.emit('createRoom', playerName)
  }, [playerName, initSocket])

  const joinRoom = useCallback((setGameState, setSelectedSong) => {
    if (!playerName.trim()) {
      setMultiplayerError('Ingresa tu nombre')
      return
    }
    if (!roomInput.trim()) {
      setMultiplayerError('Ingresa el codigo de sala')
      return
    }
    setMultiplayerError('')
    setIsMultiplayer(true)
    const socket = initSocket(setGameState, setSelectedSong)
    socket.emit('joinRoom', { roomCode: roomInput.toUpperCase(), playerName })
  }, [playerName, roomInput, initSocket])

  const selectSongMultiplayer = useCallback((song) => {
    if (socketRef.current && isHost) {
      socketRef.current.emit('selectSong', song)
    }
  }, [isHost])

  const setReady = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('playerReady')
    }
  }, [])

  const sendScoreUpdate = useCallback((score, combo, hits, misses) => {
    if (socketRef.current && isMultiplayer) {
      socketRef.current.emit('scoreUpdate', { score, combo, hits, misses })
    }
  }, [isMultiplayer])

  const sendGameFinished = useCallback((score, hits, misses, maxCombo, total) => {
    if (socketRef.current && isMultiplayer) {
      socketRef.current.emit('gameFinished', { score, hits, misses, maxCombo, total })
    }
  }, [isMultiplayer])

  const exitMultiplayer = useCallback((setGameState) => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setIsMultiplayer(false)
    setShowMultiplayerMenu(false)
    setRoomCode('')
    setOpponent(null)
    setOpponentScore(0)
    setOpponentCombo(0)
    setBothReady({ host: false, guest: false })
    setCountdown(null)
    setOpponentFinished(null)
    setMultiplayerError('')
    setGameState('idle')
  }, [])

  const value = {
    // State
    isMultiplayer,
    showMultiplayerMenu,
    playerName,
    roomCode,
    roomInput,
    opponent,
    opponentScore,
    opponentCombo,
    isHost,
    bothReady,
    countdown,
    resumeCountdown,
    opponentFinished,
    multiplayerError,
    pendingSongLoad,

    // Refs
    socketRef,

    // Setters
    setIsMultiplayer,
    setShowMultiplayerMenu,
    setPlayerName,
    setRoomCode,
    setRoomInput,
    setOpponent,
    setOpponentScore,
    setOpponentCombo,
    setIsHost,
    setBothReady,
    setCountdown,
    setResumeCountdown,
    setOpponentFinished,
    setMultiplayerError,
    setPendingSongLoad,

    // Actions
    initSocket,
    createRoom,
    joinRoom,
    selectSongMultiplayer,
    setReady,
    sendScoreUpdate,
    sendGameFinished,
    exitMultiplayer,
  }

  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  )
}

export function useMultiplayer() {
  const context = useContext(MultiplayerContext)
  if (!context) {
    throw new Error('useMultiplayer must be used within a MultiplayerProvider')
  }
  return context
}
