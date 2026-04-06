import { create } from 'zustand'
import { SimulationState, SimulationConfig } from '../simulation/types'
import { createSimulation, stepSimulation } from '../simulation/engine'

const DEFAULT_CONFIG: SimulationConfig = {
  world: {
    width: 30,
    height: 20,
    agentCount: 10,
    resourceDensity: 0.08,
    obstacleDensity: 0.06,
    defaultTraits: {},
  },
  tickIntervalMs: 300,
  maxTicks: 5000,
}

interface SimulationStore {
  simulation: SimulationState
  config: SimulationConfig
  selectedAgentId: string | null
  tickIntervalMs: number

  setConfig: (config: SimulationConfig) => void
  start: () => void
  pause: () => void
  reset: () => void
  step: () => void
  setSpeed: (ms: number) => void
  selectAgent: (id: string | null) => void
  randomize: () => void
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  simulation: createSimulation(DEFAULT_CONFIG),
  config: DEFAULT_CONFIG,
  selectedAgentId: null,
  tickIntervalMs: DEFAULT_CONFIG.tickIntervalMs,

  setConfig: (config) => {
    set({ config, simulation: createSimulation(config) })
  },

  start: () => {
    set(s => ({ simulation: { ...s.simulation, running: true } }))
  },

  pause: () => {
    set(s => ({ simulation: { ...s.simulation, running: false } }))
  },

  reset: () => {
    const { config } = get()
    set({ simulation: createSimulation(config), selectedAgentId: null })
  },

  step: () => {
    set(s => ({ simulation: stepSimulation(s.simulation) }))
  },

  setSpeed: (ms) => {
    set({ tickIntervalMs: ms })
  },

  selectAgent: (id) => {
    set({ selectedAgentId: id })
  },

  randomize: () => {
    const { config } = get()
    set({ simulation: createSimulation(config) })
  },
}))
