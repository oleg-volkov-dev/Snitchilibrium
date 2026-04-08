import { AgentTraits } from './types'
import { clamp } from './utils'

export interface AgentPreset {
  name: string
  description: string
  traits: AgentTraits
}

// Normalise raw trait values so they always sum to 3.5 — same budget as random agents.
function norm(raw: AgentTraits): AgentTraits {
  const sum = Object.values(raw).reduce((a, b) => a + b, 0)
  const s = 3.5 / sum
  return {
    aggression:    clamp(raw.aggression    * s, 0, 1),
    trust:         clamp(raw.trust         * s, 0, 1),
    loyalty:       clamp(raw.loyalty       * s, 0, 1),
    greed:         clamp(raw.greed         * s, 0, 1),
    riskTolerance: clamp(raw.riskTolerance * s, 0, 1),
    memory:        clamp(raw.memory        * s, 0, 1),
    irrationality: clamp(raw.irrationality * s, 0, 1),
  }
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    name: 'Maximizer',
    description: 'Rational utility maximiser — cold, calculated, almost no emotion.',
    traits: norm({ aggression: 0.40, trust: 0.50, loyalty: 0.35, greed: 0.72, riskTolerance: 0.56, memory: 0.92, irrationality: 0.04 }),
  },
  {
    name: 'Opportunist',
    description: 'Friendly when weak, treacherous when strong.',
    traits: norm({ aggression: 0.55, trust: 0.65, loyalty: 0.07, greed: 0.72, riskTolerance: 0.60, memory: 0.72, irrationality: 0.13 }),
  },
  {
    name: 'Loyalist',
    description: 'Values stable alliances deeply and punishes betrayal hard.',
    traits: norm({ aggression: 0.28, trust: 0.82, loyalty: 0.95, greed: 0.25, riskTolerance: 0.35, memory: 0.78, irrationality: 0.05 }),
  },
  {
    name: 'Paranoid',
    description: 'Distrusts everyone, attacks preemptively, rarely allies.',
    traits: norm({ aggression: 0.88, trust: 0.05, loyalty: 0.22, greed: 0.50, riskTolerance: 0.72, memory: 0.82, irrationality: 0.22 }),
  },
  {
    name: 'Vengeful',
    description: 'Remembers every harm and sacrifices efficiency for revenge.',
    traits: norm({ aggression: 0.72, trust: 0.25, loyalty: 0.55, greed: 0.26, riskTolerance: 0.60, memory: 0.95, irrationality: 0.26 }),
  },
  {
    name: 'Merchant',
    description: 'Avoids war unless profitable — hoards resources above all.',
    traits: norm({ aggression: 0.18, trust: 0.52, loyalty: 0.40, greed: 0.95, riskTolerance: 0.28, memory: 0.75, irrationality: 0.05 }),
  },
  {
    name: 'Expansionist',
    description: 'Values territory and dominance over personal safety.',
    traits: norm({ aggression: 0.82, trust: 0.28, loyalty: 0.28, greed: 0.68, riskTolerance: 0.90, memory: 0.38, irrationality: 0.15 }),
  },
  {
    name: 'Coward',
    description: 'Avoids battle, runs often, hides, scavenges.',
    traits: norm({ aggression: 0.05, trust: 0.55, loyalty: 0.52, greed: 0.62, riskTolerance: 0.05, memory: 0.75, irrationality: 0.18 }),
  },
  {
    name: 'Berserker',
    description: 'Highly aggressive, low caution, overcommits to every fight.',
    traits: norm({ aggression: 0.92, trust: 0.18, loyalty: 0.28, greed: 0.38, riskTolerance: 0.92, memory: 0.18, irrationality: 0.32 }),
  },
  {
    name: 'Manipulator',
    description: 'Forms alliances often, defects at the most profitable moment.',
    traits: norm({ aggression: 0.38, trust: 0.82, loyalty: 0.05, greed: 0.78, riskTolerance: 0.48, memory: 0.90, irrationality: 0.05 }),
  },
  {
    name: 'TitForTat',
    description: 'Cooperates until harmed, then mirrors the behaviour exactly.',
    traits: norm({ aggression: 0.38, trust: 0.72, loyalty: 0.65, greed: 0.45, riskTolerance: 0.38, memory: 0.88, irrationality: 0.08 }),
  },
  {
    name: 'Chaotic',
    description: 'Acts against its own interest — emotional spikes and pure randomness.',
    traits: norm({ aggression: 0.48, trust: 0.48, loyalty: 0.28, greed: 0.42, riskTolerance: 0.50, memory: 0.18, irrationality: 0.35 }),
  },
]
