import { useEffect, useRef } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import styles from './Controls.module.css'

export function Controls() {
  const { simulation, tickIntervalMs, start, pause, reset, step, setSpeed, randomize } =
    useSimulationStore()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepFn = useSimulationStore(s => s.step)
  const running = simulation.running
  const finished = simulation.winners.length > 0 || simulation.draw || simulation.tick >= simulation.config.maxTicks

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        stepFn()
      }, tickIntervalMs)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running, tickIntervalMs, stepFn])

  const speeds = [
    { label: 'Slow', ms: 600 },
    { label: 'Normal', ms: 300 },
    { label: 'Fast', ms: 80 },
  ]

  return (
    <div className={styles.controls}>
      <h3 className={styles.heading}>Simulation controls</h3>
      <div className={styles.row}>
        <button className={`${styles.btn} ${styles.primary}`} onClick={running ? pause : start} disabled={finished}>
          {running ? 'Ⅱ Pause' : '▶ Start'}
        </button>
        <button className={styles.btn} onClick={step} disabled={running || finished}>
          Step
        </button>
        <button className={styles.btn} onClick={reset}>
          Reset
        </button>
        <button className={styles.btn} onClick={randomize}>
          Randomize
        </button>
      </div>
      <div className={styles.speedRow}>
        <span className={styles.label}>Speed</span>
        <div className={styles.speedBtns}>
          {speeds.map(s => (
            <button
              key={s.label}
              aria-pressed={tickIntervalMs === s.ms}
              className={`${styles.btn} ${tickIntervalMs === s.ms ? styles.btnActive : ''}`}
              onClick={() => setSpeed(s.ms)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.tick}>{finished ? 'Run complete · reset to start again' : 'Reach 100 resources or outlast your rivals.'}</div>
    </div>
  )
}
