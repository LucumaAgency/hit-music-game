import { useGame } from '../../contexts/GameContext'
import { useAudio } from '../../contexts/AudioContext'
import { useMultiplayer } from '../../contexts/MultiplayerContext'

function Header() {
  const { score, combo, hits, misses } = useGame()
  const { volume, bpm, speedMultiplier, setSpeedMultiplier, handleVolumeChange } = useAudio()
  const { isMultiplayer, opponent, opponentScore, opponentCombo } = useMultiplayer()

  return (
    <div className="header">
      <h1>Guitar Flash Clone</h1>
      <div className="stats">
        <span>Score: {score}</span>
        <span>Combo: {combo}x</span>
        <span>Hits: {hits}</span>
        <span>Miss: {misses}</span>
        <span>BPM: {bpm}</span>
        {isMultiplayer && opponent && (
          <span className="opponent-score">VS {opponent}: {opponentScore} ({opponentCombo}x)</span>
        )}
      </div>
      <div className="controls">
        <label className="volume-control">
          Vol
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          />
        </label>
        <label className="speed-control">
          Velocidad
          <select
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
            <option value="2.5">2.5x</option>
            <option value="3">3x</option>
            <option value="4">4x</option>
            <option value="5">5x</option>
            <option value="6">6x</option>
            <option value="7">7x</option>
            <option value="8">8x</option>
            <option value="9">9x</option>
            <option value="10">10x</option>
          </select>
        </label>
        <span className="pause-hint">P = Pausa | ESC = Menu</span>
      </div>
    </div>
  )
}

export default Header
