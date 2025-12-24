import { useAudio } from '../../contexts/AudioContext'
import { useGame } from '../../contexts/GameContext'

function RecordingDoneScreen({ onSaveNotes, onStartRecording, onBackToMenu }) {
  const { selectedSong } = useAudio()
  const { recordedNotes, setShowEditor } = useGame()

  return (
    <div className="menu">
      <h2>Grabacion Terminada</h2>
      <p className="song-info">{selectedSong?.title} - {selectedSong?.artist}</p>
      <p className="recording-count">{recordedNotes.length} notas grabadas</p>
      <div className="ready-buttons">
        <button onClick={onSaveNotes}>Guardar Notas</button>
        <button onClick={() => setShowEditor(true)}>Editar Notas</button>
        <button onClick={onStartRecording}>Grabar de Nuevo</button>
      </div>
      <button className="back-button" onClick={onBackToMenu}>Descartar y Volver</button>
    </div>
  )
}

export default RecordingDoneScreen
