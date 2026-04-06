import { useSimulationStore } from '../../store/simulationStore'
import { EventLogEntry } from '../../simulation/types'
import styles from './EventLog.module.css'

const ACTION_COLORS: Record<string, string> = {
  'attack': '#ef4444',
  'betray-ally': '#f97316',
  'gather': '#22c55e',
  'accept-alliance': '#fbbf24',
  'reject-alliance': '#6b7280',
  'move': '#4b5563',
  'defend': '#6366f1',
  'support-ally': '#14b8a6',
}

function EntryRow({ entry }: { entry: EventLogEntry }) {
  const color = ACTION_COLORS[entry.action] ?? '#9ca3af'
  return (
    <div className={styles.entry}>
      <span className={styles.tick}>{entry.tick}</span>
      <span className={styles.dot} style={{ background: color }} />
      <span className={styles.desc}>{entry.description}</span>
    </div>
  )
}

export function EventLog() {
  const events = useSimulationStore(s => s.simulation.events)
  const visible = [...events].reverse().slice(0, 80)

  return (
    <div className={styles.list}>
      {visible.length === 0 && (
        <div className={styles.empty}>No events yet</div>
      )}
      {visible.map((e, i) => (
        <EntryRow key={i} entry={e} />
      ))}
    </div>
  )
}
