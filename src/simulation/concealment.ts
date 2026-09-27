import { AgentState, Cell } from './types'

export const HIDE_DURATION = 30
export const HIDE_COOLDOWN = 30

export function isHidden(agent: AgentState, grid: Cell[][], tick: number): boolean {
  return agent.alive && tick < agent.hiddenUntil
    && grid[agent.position.y]?.[agent.position.x]?.type === 'grass'
}
