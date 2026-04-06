import { Grid } from './components/Grid/Grid'
import { Controls } from './components/Controls/Controls'
import { Leaderboard } from './components/Leaderboard/Leaderboard'
import { AgentPanel } from './components/AgentPanel/AgentPanel'
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel'
import { WinnerBanner } from './components/WinnerBanner/WinnerBanner'
import { RightPanel } from './components/RightPanel/RightPanel'
import { useSimulationStore } from './store/simulationStore'
import styles from './App.module.css'

export function App() {
  const standoffSince = useSimulationStore(s => s.simulation.standoffSince)
  const winners = useSimulationStore(s => s.simulation.winners)

  return (
    <div className={styles.app} style={{ paddingTop: standoffSince > 0 && winners.length === 0 ? 38 : 0 }}>
      <WinnerBanner />
      <header className={styles.header}>
        <h1 className={styles.title}>Snitchilibrium</h1>
        <p className={styles.subtitle}>A grid-based multi-agent strategy sandbox</p>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <Controls />
          <ConfigPanel />
          <Leaderboard />
          <AgentPanel />
        </aside>
        <main className={styles.main}>
          <Grid />
        </main>
        <RightPanel />
      </div>
    </div>
  )
}
