import { useSimulationStore } from '../../store/simulationStore'
import { getAllianceGroups } from '../../simulation/engine'
import styles from './AllianceTab.module.css'

export function AllianceTab() {
  const agents = useSimulationStore(s => s.simulation.agents)
  const tick = useSimulationStore(s => s.simulation.tick)
  const standoffSince = useSimulationStore(s => s.simulation.standoffSince)
  const selectAgent = useSimulationStore(s => s.selectAgent)

  const groups = getAllianceGroups(agents)

  return (
    <div className={styles.panel}>
      {standoffSince > 0 && (
        <div className={styles.standoffNote}>
          Alliance standoff in progress — betrayal pressure rising
        </div>
      )}
      {groups.length === 0 ? (
        <div className={styles.empty}>No active alliances</div>
      ) : (
        <div className={styles.list}>
          {groups.map(({ members, since }) => (
            <div key={members.map(m => m.id).join('-')} className={styles.row}>
              <div className={styles.pair}>
                {members.map((m, i) => (
                  <span key={m.id}>
                    <span
                      className={styles.name}
                      onClick={() => selectAgent(m.id)}
                      style={{ color: m.color }}
                    >
                      {m.name}
                    </span>
                    {i < members.length - 1 && (
                      <span className={styles.connector}>+</span>
                    )}
                  </span>
                ))}
              </div>
              <span className={styles.duration}>{tick - since}t</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#fbbf24' }} />
          +50% damage per adjacent ally in a fight
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#4ade80' }} />
          Gathered resources split evenly among group
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#60a5fa' }} />
          Loyal agents share resources with poorer allies
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#ef4444' }} />
          Betrayal breaks all group bonds, steals 35%
        </div>
      </div>
    </div>
  )
}
