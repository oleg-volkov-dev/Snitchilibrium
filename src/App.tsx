import { Grid } from './components/Grid/Grid'
import { Controls } from './components/Controls/Controls'
import { Leaderboard } from './components/Leaderboard/Leaderboard'
import { EventLog } from './components/EventLog/EventLog'
import { AgentPanel } from './components/AgentPanel/AgentPanel'
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel'
import styles from './App.module.css'

export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Snitchilibrium</h1>
        <p className={styles.subtitle}>
          A grid-based multi-agent strategy sandbox
        </p>
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
        <aside className={styles.log}>
          <EventLog />
        </aside>
      </div>
    </div>
  )
}
