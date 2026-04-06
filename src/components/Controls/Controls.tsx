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

  const speedLabel = tickIntervalMs <= 100 ? 'Fast' : tickIntervalMs <= 300 ? 'Normal' : 'Slow'

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <button
          className={styles.btn}
          onClick={running ? pause : start}
        >
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
        <label className={styles.label}>Speed: {speedLabel}</label>
        <input
          type="range"
          min={50}
          max={1000}
          step={50}
          value={tickIntervalMs}
          onChange={e => setSpeed(Number(e.target.value))}
          className={styles.slider}
        />
      </div>
      <div className={styles.tick}>Tick: {simulation.tick}</div>
    </div>
  )
}
