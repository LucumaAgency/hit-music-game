import { useGame } from '../../contexts/GameContext'
import { useMultiplayer } from '../../contexts/MultiplayerContext'

function ResultsScreen({ onPlayAgain, onBackToMenu, onExitMultiplayer }) {
  const { score, hits, misses, maxCombo, notes } = useGame()
  const {
    isMultiplayer,
    playerName,
    opponent,
    opponentFinished,
  } = useMultiplayer()

  if (isMultiplayer) {
    return (
      <div className="menu results">
        <h2>Resultados</h2>
        <div className="multiplayer-results">
          <div className={`player-result ${score > (opponentFinished?.score || 0) ? 'winner' : score < (opponentFinished?.score || 0) ? 'loser' : ''}`}>
            <h3>{playerName} (Tu)</h3>
            <p className="result-score">{score}</p>
            <p>Hits: {hits} / {notes.length}</p>
            <p>Precision: {notes.length > 0 ? Math.round((hits / notes.length) * 100) : 0}%</p>
            <p>Max Combo: {maxCombo}x</p>
          </div>
          {opponentFinished ? (
            <div className={`player-result ${opponentFinished.score > score ? 'winner' : opponentFinished.score < score ? 'loser' : ''}`}>
              <h3>{opponent}</h3>
              <p className="result-score">{opponentFinished.score}</p>
              <p>Hits: {opponentFinished.hits} / {opponentFinished.total || notes.length}</p>
              <p>Precision: {(opponentFinished.total || notes.length) > 0 ? Math.round((opponentFinished.hits / (opponentFinished.total || notes.length)) * 100) : 0}%</p>
              <p>Max Combo: {opponentFinished.maxCombo}x</p>
            </div>
          ) : (
            <div className="player-result waiting">
              <h3>{opponent}</h3>
              <p>Esperando...</p>
              <div className="loader"></div>
            </div>
          )}
        </div>
        {opponentFinished && (
          <div className="winner-announcement">
            {score > opponentFinished.score ? (
              <h2 className="you-win">GANASTE!</h2>
            ) : score < opponentFinished.score ? (
              <h2 className="you-lose">Perdiste</h2>
            ) : (
              <h2 className="tie">Empate!</h2>
            )}
          </div>
        )}
        <button className="back-button" onClick={onExitMultiplayer}>Volver al Menu</button>
      </div>
    )
  }

  return (
    <div className="menu results">
      <h2>Cancion Terminada!</h2>
      <div className="final-stats">
        <p>Score Final: <strong>{score}</strong></p>
        <p>Hits: {hits} / {notes.length}</p>
        <p>Precision: {notes.length > 0 ? Math.round((hits / notes.length) * 100) : 0}%</p>
        <p>Max Combo: {maxCombo}x</p>
      </div>
      <button onClick={onPlayAgain}>Jugar de Nuevo</button>
      <button className="back-button" onClick={onBackToMenu}>Volver al Menu</button>
    </div>
  )
}

export default ResultsScreen
