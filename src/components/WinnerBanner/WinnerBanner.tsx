import { useSimulationStore } from '../../store/simulationStore'
import styles from './WinnerBanner.module.css'

export function WinnerBanner() {
  const winner = useSimulationStore(s => s.simulation.winner)
  const story = useSimulationStore(s => s.simulation.story)
  const reset = useSimulationStore(s => s.reset)

  if (!winner) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.winnerDot} style={{ background: winner.color }} />
        <h2 className={styles.title}>{winner.name} wins</h2>
        <p className={styles.subtitle}>Last agent standing</p>
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
