import { useAudio } from '../../contexts/AudioContext'
import { useGame } from '../../contexts/GameContext'

function PreGameScreen({ onStartGame, onStartRecording, onBackToMenu }) {
  const { selectedSong, bpm } = useAudio()
  const { notes, loadedFromJson, setShowEditor } = useGame()

  return (
    <div className="menu">
      <h2>Listo!</h2>
      <p className="song-info">{selectedSong?.title} - {selectedSong?.artist}</p>
      <p>{notes.length} notas {loadedFromJson ? 'cargadas' : 'generadas'} | {bpm} BPM</p>
      <div className="ready-buttons">
        <button onClick={onStartGame}>Jugar</button>
        <button className="record-button" onClick={onStartRecording}>Grabar Notas</button>
        <button className="edit-button" onClick={() => setShowEditor(true)}>Editar Notas</button>
      </div>
      <button className="back-button" onClick={onBackToMenu}>Volver</button>
    </div>
  )
}

export default PreGameScreen
