import { useState } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import { SimulationConfig } from '../../simulation/types'
import styles from './ConfigPanel.module.css'

export function ConfigPanel() {
  const { config, setConfig } = useSimulationStore()
  const [local, setLocal] = useState(config)
  const [open, setOpen] = useState(false)

  function handleApply() {
    setConfig(local)
    setOpen(false)
  }

  function updateWorld<K extends keyof SimulationConfig['world']>(
    key: K,
    value: SimulationConfig['world'][K]
  ) {
    setLocal(c => ({ ...c, world: { ...c.world, [key]: value } }))
  }

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggle} onClick={() => setOpen(o => !o)}>
        {open ? 'Hide Config' : 'Configure World'}
      </button>
      {open && (
        <div className={styles.panel}>
          <div className={styles.field}>
            <label>Grid Width</label>
            <input
              type="number"
              min={10}
              max={60}
              value={local.world.width}
              onChange={e => updateWorld('width', Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label>Grid Height</label>
            <input
              type="number"
              min={10}
              max={40}
              value={local.world.height}
              onChange={e => updateWorld('height', Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label>Agents</label>
            <input
              type="number"
              min={2}
              max={20}
              value={local.world.agentCount}
              onChange={e => updateWorld('agentCount', Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label>Resource Density</label>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={local.world.resourceDensity}
              onChange={e => updateWorld('resourceDensity', Number(e.target.value))}
            />
            <span>{(local.world.resourceDensity * 100).toFixed(0)}%</span>
          </div>
          <div className={styles.field}>
            <label>Obstacle Density</label>
            <input
              type="range"
              min={0}
              max={0.25}
              step={0.01}
              value={local.world.obstacleDensity}
              onChange={e => updateWorld('obstacleDensity', Number(e.target.value))}
            />
            <span>{(local.world.obstacleDensity * 100).toFixed(0)}%</span>
          </div>
          <button className={styles.apply} onClick={handleApply}>
            Apply and Reset
          </button>
        </div>
      )}
    </div>
  )
}
