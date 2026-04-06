import { useSimulationStore } from '../../store/simulationStore'
import { getLeaderboard } from '../../simulation/engine'
import styles from './Leaderboard.module.css'

export function Leaderboard() {
  const simulation = useSimulationStore(s => s.simulation)
  const selectAgent = useSimulationStore(s => s.selectAgent)
  const selectedId = useSimulationStore(s => s.selectedAgentId)

  const ranked = getLeaderboard(simulation.agents)
  const dead = simulation.agents.filter(a => !a.alive)

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Leaderboard</h3>
      <div className={styles.list}>
        {ranked.map((agent, i) => (
          <div
            key={agent.id}
            className={`${styles.row} ${agent.id === selectedId ? styles.selected : ''}`}
            onClick={() => selectAgent(agent.id)}
          >
            <span className={styles.rank}>#{i + 1}</span>
            <span className={styles.dot} style={{ background: agent.color }} />
            <span className={styles.name}>{agent.name}</span>
            <span className={styles.resources}>{agent.resources}</span>
            <div className={styles.healthBar}>
              <div
                className={styles.healthFill}
                style={{
                  width: `${agent.health}%`,
                  background: agent.health > 50 ? '#22c55e' : agent.health > 25 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          </div>
        ))}
        {dead.length > 0 && (
          <div className={styles.deadCount}>{dead.length} eliminated</div>
        )}
      </div>
    </div>
  )
}
