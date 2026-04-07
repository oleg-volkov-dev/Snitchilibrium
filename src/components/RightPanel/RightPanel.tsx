import { useState } from 'react'
import { EventLog } from '../EventLog/EventLog'
import { AllianceTab } from '../AllianceTab/AllianceTab'
import { useSimulationStore } from '../../store/simulationStore'
import { getAllianceGroups } from '../../simulation/engine'
import styles from './RightPanel.module.css'

type Tab = 'log' | 'alliances'

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('log')
  const agents = useSimulationStore(s => s.simulation.agents)
  const allianceCount = getAllianceGroups(agents).length

  return (
    <div className={styles.panel}>
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
  )
}
