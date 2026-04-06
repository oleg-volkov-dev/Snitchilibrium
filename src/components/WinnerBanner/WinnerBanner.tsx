import { useSimulationStore } from '../../store/simulationStore'
import styles from './WinnerBanner.module.css'

const STANDOFF_TIMEOUT = 120

export function WinnerBanner() {
  const winners = useSimulationStore(s => s.simulation.winners)
  const story = useSimulationStore(s => s.simulation.story)
  const standoffSince = useSimulationStore(s => s.simulation.standoffSince)
  const tick = useSimulationStore(s => s.simulation.tick)
  const reset = useSimulationStore(s => s.reset)

  const standoffActive = standoffSince > 0 && winners.length === 0
  const standoffRemaining = standoffActive
    ? Math.max(0, STANDOFF_TIMEOUT - (tick - standoffSince))
    : 0

  if (winners.length === 0 && !standoffActive) return null

  if (standoffActive) {
    return (
      <div className={styles.standoffBar}>
        <span className={styles.standoffText}>
          All survivors are allied. Alliance wins in {standoffRemaining} ticks unless someone betrays.
        </span>
        <div
          className={styles.standoffProgress}
          style={{ width: `${((STANDOFF_TIMEOUT - standoffRemaining) / STANDOFF_TIMEOUT) * 100}%` }}
        />
      </div>
    )
  }

  const isAllianceWin = winners.length > 1
  const title = isAllianceWin
    ? winners.map(w => w.name).join(' & ') + ' win'
    : winners[0].name + ' wins'
  const subtitle = isAllianceWin ? 'Alliance victory' : 'Last agent standing'

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.dots}>
          {winners.map(w => (
            <div key={w.id} className={styles.winnerDot} style={{ background: w.color }} />
          ))}
        </div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.story}>
          {story.map((line, i) => (
            <p key={i} className={styles.line}>{line}</p>
          ))}
        </div>
        <button className={styles.resetBtn} onClick={reset}>
          Play Again
        </button>
      </div>
    </div>
  )
}
