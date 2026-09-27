import { Grid } from './components/Grid/Grid'
import { Controls } from './components/Controls/Controls'
import { Leaderboard } from './components/Leaderboard/Leaderboard'
import { ConfigPanel } from './components/ConfigPanel/ConfigPanel'
import { WinnerBanner } from './components/WinnerBanner/WinnerBanner'
import { RightPanel } from './components/RightPanel/RightPanel'
import { useSimulationStore } from './store/simulationStore'
import styles from './App.module.css'

export function App() {
  const standoffSince = useSimulationStore(s => s.simulation.standoffSince)
  const simulation = useSimulationStore(s => s.simulation)
  const { winners, draw, running, tick, agents, config } = simulation
  const alive = agents.filter(a => a.alive).length
  const finished = winners.length > 0 || draw || tick >= config.maxTicks

  return (
    <div className={styles.app} style={{ paddingTop: standoffSince > 0 && !finished ? 38 : 0 }}>
      <WinnerBanner />
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">S<span>↗</span></span>
          <div>
            <h1 className={styles.title}>Snitchilibrium<span className={styles.version}>SANDBOX</span></h1>
            <p className={styles.subtitle}>Cooperate. Compete. Betray. Watch strategy emerge.</p>
          </div>
        </div>
        <span className={`${styles.status} ${running ? styles.live : ''}`}>
          <span />{finished ? 'Run complete' : running ? 'Simulation live' : tick === 0 ? 'Ready to simulate' : 'Simulation paused'}
        </span>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <Controls />
          <ConfigPanel />
          <Leaderboard />
        </aside>
        <main className={styles.main}>
          <div className={styles.arenaHeader}>
            <div><p className={styles.eyebrow}>THE EXPERIMENT</p><h2>The arena</h2></div>
            <span className={styles.mapSize}>{config.world.width} × {config.world.height} world</span>
          </div>
          <Grid />
          <div className={styles.metrics}>
            <div><span>Elapsed ticks</span><strong>{tick.toLocaleString()}<small> / {config.maxTicks.toLocaleString()}</small></strong></div>
            <div><span>Agents alive</span><strong>{alive}<small> / {agents.length}</small></strong></div>
            <div><span>Death zone</span><strong className={tick >= config.world.deathZoneStart ? styles.danger : ''}>{tick >= config.world.deathZoneStart ? 'Closing in' : (config.world.deathZoneStart - tick).toLocaleString()}<small>{tick < config.world.deathZoneStart ? ' ticks away' : ''}</small></strong></div>
          </div>
          <div className={styles.arenaFooter}>
            <div className={styles.legend}><span><i className={styles.agentKey} />Agent</span><span><i className={styles.resourceKey} />Resource</span><span><i className={styles.rockKey} />Obstacle</span><span><i className={styles.allianceKey} />Alliance</span></div>
            <p>Select an agent to inspect traits and shared vision.</p>
          </div>
        </main>
        <RightPanel />
      </div>
    </div>
  )
}
