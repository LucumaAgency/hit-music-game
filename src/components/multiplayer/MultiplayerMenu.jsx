import { useGame } from '../../contexts/GameContext'
import { useAudio } from '../../contexts/AudioContext'
import { useMultiplayer } from '../../contexts/MultiplayerContext'

function MultiplayerMenu() {
  const { setGameState } = useGame()
  const { setSelectedSong } = useAudio()
  const {
    playerName,
    roomInput,
    multiplayerError,
    setPlayerName,
    setRoomInput,
    setShowMultiplayerMenu,
    createRoom,
    joinRoom,
  } = useMultiplayer()

  const handleCreateRoom = () => {
    createRoom(setGameState, setSelectedSong)
  }

  const handleJoinRoom = () => {
    joinRoom(setGameState, setSelectedSong)
  }

  return (
    <div className="menu">
      <h2>Multijugador</h2>

      <div className="multiplayer-section">
        <input
          type="text"
          placeholder="Tu nombre"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="multiplayer-input"
        />

        <button className="multiplayer-btn create" onClick={handleCreateRoom}>
          Crear Sala
        </button>

        <div className="join-divider">
          <span>o unete a una sala</span>
        </div>

        <div className="join-section">
          <input
            type="text"
            placeholder="Codigo de sala"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
            className="room-code-input"
            maxLength={6}
          />
          <button className="multiplayer-btn join" onClick={handleJoinRoom}>
            Unirse
          </button>
        </div>

        {multiplayerError && <p className="error-msg">{multiplayerError}</p>}
      </div>

      <button className="back-button" onClick={() => setShowMultiplayerMenu(false)}>
        Volver
      </button>
    </div>
  )
}

export default MultiplayerMenu
