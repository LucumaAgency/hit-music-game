import { useGame } from '../../contexts/GameContext'
import { useAudio } from '../../contexts/AudioContext'
import { useMultiplayer } from '../../contexts/MultiplayerContext'

function MultiplayerLobby({ onExitMultiplayer }) {
  const { gameState, setGameState, setNotesData, setLoadedFromJson } = useGame()
  const { songs, selectedSong, loadSong } = useAudio()
  const {
    roomCode,
    playerName,
    opponent,
    isHost,
    bothReady,
    countdown,
    selectSongMultiplayer,
    setReady,
  } = useMultiplayer()

  const handleSelectSong = async (song) => {
    selectSongMultiplayer(song)
    const result = await loadSong(song, setGameState, setNotesData)
    if (result?.success) {
      setLoadedFromJson(result.fromJson)
    }
  }

  return (
    <div className="menu lobby">
      <h2>Sala: {roomCode}</h2>
      <div className="players-list">
        <div className="player-item">
          <span className="player-name">{playerName} (Tu){isHost ? ' - Host' : ''}</span>
          <span className={`ready-status ${isHost ? (bothReady.host ? 'ready' : '') : (bothReady.guest ? 'ready' : '')}`}>
            {(isHost ? bothReady.host : bothReady.guest) ? 'LISTO' : 'Esperando...'}
          </span>
        </div>
        {opponent ? (
          <div className="player-item">
            <span className="player-name">{opponent}{!isHost ? ' - Host' : ''}</span>
            <span className={`ready-status ${!isHost ? (bothReady.host ? 'ready' : '') : (bothReady.guest ? 'ready' : '')}`}>
              {(!isHost ? bothReady.host : bothReady.guest) ? 'LISTO' : 'Esperando...'}
            </span>
          </div>
        ) : (
          <div className="player-item waiting">
            <span>Esperando oponente...</span>
          </div>
        )}
      </div>

      {isHost && opponent && gameState !== 'analyzing' && (
        <>
          <h3>Selecciona Cancion:</h3>
          <div className="song-list">
            {songs.map(song => (
              <button
                key={song.id}
                className={`song-button ${selectedSong?.id === song.id ? 'selected' : ''}`}
                onClick={() => handleSelectSong(song)}
              >
                <span className="song-title">{song.title}</span>
                <span className="song-artist">{song.artist}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {selectedSong && (
        <p className="song-info">Cancion: {selectedSong.title} - {selectedSong.artist}</p>
      )}

      {gameState === 'analyzing' && (
        <>
          <p>Cargando cancion...</p>
          <div className="loader"></div>
        </>
      )}

      {selectedSong && gameState === 'ready' && (
        <button className="ready-button" onClick={setReady}>
          {(isHost ? bothReady.host : bothReady.guest) ? 'Esperando al otro...' : 'LISTO!'}
        </button>
      )}

      {countdown !== null && (
        <div className="countdown">{countdown}</div>
      )}

      <button className="back-button" onClick={onExitMultiplayer}>Salir</button>
    </div>
  )
}

export default MultiplayerLobby
