import { useAudio } from '../../contexts/AudioContext'
import { useGame } from '../../contexts/GameContext'
import { useMultiplayer } from '../../contexts/MultiplayerContext'
import UploadForm from '../ui/UploadForm'
import SongsGrid from '../ui/SongsGrid'

function HomeScreen() {
  const { songs, loadSong, handleFileUpload } = useAudio()
  const { setGameState, setNotesData, setLoadedFromJson } = useGame()
  const { setShowMultiplayerMenu } = useMultiplayer()

  const handleSelectSong = async (song) => {
    const result = await loadSong(song, setGameState, setNotesData)
    if (result?.success) {
      setLoadedFromJson(result.fromJson)
    }
  }

  const handleFileSelect = (file) => {
    handleFileUpload(file, setGameState, setNotesData)
  }

  return (
    <div className="home-container">
      {/* Header */}
      <div className="home-header">
        <h1>Guitar Flash Clone</h1>
        <p>Selecciona una cancion y demuestra tu habilidad</p>
      </div>

      {/* Actions Row */}
      <div className="actions-row">
        <UploadForm onFileSelect={handleFileSelect} />

        <div className="action-card multiplayer">
          <h3>Modo Multijugador</h3>
          <p className="action-desc">Compite contra otros jugadores en tiempo real</p>
          <button
            className="action-btn purple"
            onClick={() => setShowMultiplayerMenu(true)}
          >
            Crear o Unirse a Sala
          </button>
        </div>
      </div>

      {/* Keys Hint */}
      <div className="keys-hint">
        <p>Usa estas teclas para jugar:</p>
        <div className="keys-row">
          <div className="key-display green">A</div>
          <div className="key-display red">S</div>
          <div className="key-display yellow">J</div>
          <div className="key-display blue">K</div>
          <div className="key-display orange">L</div>
        </div>
      </div>

      {/* Songs Section */}
      <SongsGrid songs={songs} onSelectSong={handleSelectSong} />
    </div>
  )
}

export default HomeScreen
