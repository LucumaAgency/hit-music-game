export const LANES = [
  { key: 'a', color: '#22c55e' },
  { key: 's', color: '#ef4444' },
  { key: 'j', color: '#eab308' },
  { key: 'k', color: '#3b82f6' },
  { key: 'l', color: '#f97316' },
]

export const BASE_NOTE_SPEED = 3
export const HIT_WINDOW = 0.15
export const MIN_TIME_BETWEEN_NOTES = 0.25
export const BASE_BPM = 120

// Hold notes (notas sostenidas)
export const HOLD_POINTS_INTERVAL = 0.1  // Cada 100ms
export const HOLD_POINTS_PER_TICK = 10   // Puntos por tick
export const HOLD_COMPLETE_BONUS = 50    // Bonus por completar
export const MIN_HOLD_DURATION = 0.3     // Mínimo para considerar hold note
