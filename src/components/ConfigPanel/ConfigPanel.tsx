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
            <label>Resources</label>
            <div className={styles.btnGroup}>
              {([['None', 0], ['Sparse', 0.005], ['Normal', 0.02], ['Rich', 0.05]] as const).map(([label, val]) => (
                <button
                  key={label}
                  className={`${styles.option} ${local.world.resourceDensity === val ? styles.optionActive : ''}`}
                  onClick={() => updateWorld('resourceDensity', val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <label>Obstacles</label>
            <div className={styles.btnGroup}>
              {([['None', 0], ['Few', 0.05], ['Normal', 0.12], ['Dense', 0.22]] as const).map(([label, val]) => (
                <button
                  key={label}
                  className={`${styles.option} ${local.world.obstacleDensity === val ? styles.optionActive : ''}`}
                  onClick={() => updateWorld('obstacleDensity', val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button className={styles.apply} onClick={handleApply}>
            Apply and Reset
          </button>
        </div>
      )}
    </div>
  )
}
