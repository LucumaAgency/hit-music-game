import { LANES } from '../../constants'
import { useGame } from '../../contexts/GameContext'
import { useAudio } from '../../contexts/AudioContext'
import Lane from './Lane'
import ComboDisplay from './ComboDisplay'

function GameArea() {
  const {
    gameState,
    combo,
    activeNotes,
    feedback,
    pressedKeys,
    isRecording,
    recordedNotesRef,
    activeHolds,
  } = useGame()

  const {
    selectedSong,
    noteSpeed,
    speedMultiplier,
    audioRef,
    ytPlayerRef,
    audioOffset,
  } = useAudio()

  // Calculate current time for note rendering
  const currentTime = selectedSong?.type === 'youtube' && ytPlayerRef.current
    ? (ytPlayerRef.current.getCurrentTime?.() || 0) + audioOffset
    : (audioRef.current?.currentTime || 0)

  if (gameState !== 'playing' && gameState !== 'finished' && gameState !== 'paused') {
    return null
  }

  return (
    <div className="game-area">
      <ComboDisplay
        combo={combo}
        isRecording={isRecording}
        recordedNotesCount={recordedNotesRef.current.length}
      />

      {LANES.map((_, laneIndex) => (
        <Lane
          key={laneIndex}
          laneIndex={laneIndex}
          activeNotes={activeNotes}
          currentTime={currentTime}
          noteSpeed={noteSpeed}
          speedMultiplier={speedMultiplier}
          pressedKeys={pressedKeys}
          feedback={feedback}
          activeHolds={activeHolds}
        />
      ))}
    </div>
  )
}

export default GameArea
