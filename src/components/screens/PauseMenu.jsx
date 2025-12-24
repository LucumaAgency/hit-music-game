import { useMultiplayer } from '../../contexts/MultiplayerContext'

function PauseMenu({ onResume, onBackToMenu }) {
  const { resumeCountdown } = useMultiplayer()

  if (resumeCountdown !== null) {
    return (
      <div className="menu pause-menu">
        <div className="resume-countdown">{resumeCountdown}</div>
        <p>Preparate...</p>
      </div>
    )
  }

  return (
    <div className="menu pause-menu">
      <h2>PAUSA</h2>
      <p>Presiona P para continuar</p>
      <button onClick={onResume}>Continuar</button>
      <button className="back-button" onClick={onBackToMenu}>Salir al Menu</button>
    </div>
  )
}

export default PauseMenu
