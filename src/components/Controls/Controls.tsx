import { useEffect, useRef } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import styles from './Controls.module.css'

export function Controls() {
  const { simulation, tickIntervalMs, start, pause, reset, step, setSpeed, randomize } =
    useSimulationStore()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepFn = useSimulationStore(s => s.step)
  const running = simulation.running

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
      <div className={styles.row}>
        <button className={styles.btn} onClick={running ? pause : start}>
          {running ? 'Pause' : 'Start'}
        </button>
        <button className={styles.btn} onClick={step} disabled={running}>
          Step
        </button>
        <button className={styles.btn} onClick={reset}>
          Reset
        </button>
        <button className={styles.btn} onClick={randomize}>
          Randomize
        </button>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Speed</span>
        {speeds.map(s => (
          <button
            key={s.label}
            className={`${styles.btn} ${tickIntervalMs === s.ms ? styles.btnActive : ''}`}
            onClick={() => setSpeed(s.ms)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className={styles.tick}>Tick: {simulation.tick}</div>
    </div>
  )
}
