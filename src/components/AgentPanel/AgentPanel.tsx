import { useSimulationStore } from '../../store/simulationStore'
import { AGENT_PRESETS } from '../../simulation/presets'
import styles from './AgentPanel.module.css'

function TraitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.traitRow}>
      <span className={styles.traitLabel}>{label}</span>
      <div className={styles.traitBar}>
        <div className={styles.traitFill} style={{ width: `${value * 100}%` }} />
      </div>
      <span className={styles.traitValue}>{(value * 100).toFixed(0)}</span>
    </div>
  )
}

export function AgentPanel() {
  const selectedId = useSimulationStore(s => s.selectedAgentId)
  const agents = useSimulationStore(s => s.simulation.agents)
  const agent = agents.find(a => a.id === selectedId)

  if (!agent) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>Click an agent to inspect</div>
      </div>
    )
  }

  const preset = AGENT_PRESETS.find(p => p.name === agent.name)

  const allies = Object.entries(agent.relations)
    .filter(([, rel]) => rel.allied)
    .map(([id]) => agents.find(a => a.id === id))
    .filter(Boolean)

  const enemies = Object.entries(agent.relations)
    .filter(([, rel]) => rel.resentment > 0.4)
    .sort(([, a], [, b]) => b.resentment - a.resentment)
    .slice(0, 3)
    .map(([id, rel]) => ({ agent: agents.find(a => a.id === id), resentment: rel.resentment }))
    .filter(e => e.agent)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.dot} style={{ background: agent.color }} />
        <span className={styles.name}>{agent.name}</span>
        {!agent.alive && <span className={styles.dead}>eliminated</span>}
      </div>
      {preset && <div className={styles.archetype}>{preset.description}</div>}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Resources</span>
          <span className={styles.statValue}>{agent.resources}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Health</span>
          <span className={styles.statValue}>{agent.health}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Position</span>
          <span className={styles.statValue}>{agent.position.x}, {agent.position.y}</span>
        </div>
      </div>

      <div className={styles.section}>Traits</div>
      <TraitBar label="Aggression" value={agent.traits.aggression} />
      <TraitBar label="Trust" value={agent.traits.trust} />
      <TraitBar label="Loyalty" value={agent.traits.loyalty} />
      <TraitBar label="Greed" value={agent.traits.greed} />
      <TraitBar label="Risk" value={agent.traits.riskTolerance} />
      <TraitBar label="Memory" value={agent.traits.memory} />
      <TraitBar label="Irrationality" value={agent.traits.irrationality} />
      <TraitBar label="Intellect" value={agent.traits.intellect} />

      {allies.length > 0 && (
        <>
          <div className={styles.section}>Allies</div>
          <div className={styles.tagList}>
            {allies.map(a => (
              <span key={a!.id} className={styles.allyTag} style={{ borderColor: a!.color }}>
                {a!.name}
              </span>
            ))}
          </div>
        </>
      )}

      {enemies.length > 0 && (
        <>
          <div className={styles.section}>Resentment</div>
          <div className={styles.tagList}>
            {enemies.map(e => (
              <span key={e.agent!.id} className={styles.enemyTag}>
                {e.agent!.name} ({(e.resentment * 100).toFixed(0)}%)
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
