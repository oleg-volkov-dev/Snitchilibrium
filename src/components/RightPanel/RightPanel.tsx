import { useState } from 'react'
import { EventLog } from '../EventLog/EventLog'
import { AllianceTab } from '../AllianceTab/AllianceTab'
import { AgentPanel } from '../AgentPanel/AgentPanel'
import { useSimulationStore } from '../../store/simulationStore'
import { getAllianceGroups } from '../../simulation/engine'
import styles from './RightPanel.module.css'

type Tab = 'log' | 'alliances'

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('log')
  const agents = useSimulationStore(s => s.simulation.agents)
  const selectedId = useSimulationStore(s => s.selectedAgentId)
  const hasSelection = agents.some(agent => agent.id === selectedId)
  const allianceCount = getAllianceGroups(agents).length

  return (
    <aside className={styles.sidebar} aria-label="Simulation activity and agent details">
      <div className={`${styles.panel} ${hasSelection ? styles.compact : ''}`}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'log' ? styles.active : ''}`}
            onClick={() => setTab('log')}
          >
            Event Log
          </button>
          <button
            className={`${styles.tab} ${tab === 'alliances' ? styles.active : ''}`}
            onClick={() => setTab('alliances')}
          >
            Alliances
            {allianceCount > 0 && (
              <span className={styles.badge}>{allianceCount}</span>
            )}
          </button>
        </div>
        <div className={styles.content}>
          {tab === 'log' ? <EventLog /> : <AllianceTab />}
        </div>
      </div>
      {hasSelection && (
        <section key={selectedId} className={styles.inspector} aria-label="Selected agent details">
          <AgentPanel />
        </section>
      )}
    </aside>
  )
}
