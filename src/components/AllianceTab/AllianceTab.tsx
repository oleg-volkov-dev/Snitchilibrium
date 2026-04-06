import { useSimulationStore } from '../../store/simulationStore'
import { getActiveAlliances } from '../../simulation/engine'
import styles from './AllianceTab.module.css'

export function AllianceTab() {
  const agents = useSimulationStore(s => s.simulation.agents)
  const tick = useSimulationStore(s => s.simulation.tick)
  const standoffSince = useSimulationStore(s => s.simulation.standoffSince)
  const selectAgent = useSimulationStore(s => s.selectAgent)

  const alliances = getActiveAlliances(agents)

  return (
    <div className={styles.panel}>
      {standoffSince > 0 && (
        <div className={styles.standoffNote}>
          Alliance standoff in progress — betrayal pressure rising
        </div>
      )}
      {alliances.length === 0 ? (
        <div className={styles.empty}>No active alliances</div>
      ) : (
        <div className={styles.list}>
          {alliances.map(({ a, b, since }) => (
            <div key={`${a.id}-${b.id}`} className={styles.row}>
              <div className={styles.pair}>
                <span
                  className={styles.name}
                  onClick={() => selectAgent(a.id)}
                  style={{ color: a.color }}
                >
                  {a.name}
                </span>
                <span className={styles.connector}>+</span>
                <span
                  className={styles.name}
                  onClick={() => selectAgent(b.id)}
                  style={{ color: b.color }}
                >
                  {b.name}
                </span>
              </div>
              <span className={styles.duration}>{tick - since}t</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#fbbf24' }} />
          Ally attack deals +25% damage per supporter
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#ef4444' }} />
          Betrayal steals 35% resources and tanks trust
        </div>
      </div>
    </div>
  )
}
