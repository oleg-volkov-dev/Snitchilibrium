import { AgentTraits } from './types'

// Redistribute overflow after capping a trait, preserving the common budget.
export function normalizeTraits(raw: AgentTraits): AgentTraits {
  const keys = Object.keys(raw) as (keyof AgentTraits)[]
  const result = { ...raw }
  let remaining = 3.5
  let active = keys
  while (active.length > 0) {
    const total = active.reduce((sum, key) => sum + Math.max(0, raw[key]), 0)
    const values = active.map(key => total > 0 ? Math.max(0, raw[key]) / total * remaining : remaining / active.length)
    const capped = active.filter((_, i) => values[i] > 1)
    if (capped.length === 0) {
      active.forEach((key, i) => { result[key] = values[i] })
      break
    }
    capped.forEach(key => { result[key] = 1 })
    remaining -= capped.length
    active = active.filter(key => !capped.includes(key))
  }
  return result
}
