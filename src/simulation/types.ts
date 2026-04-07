export type Position = { x: number; y: number }

export type CellType = 'empty' | 'obstacle' | 'resource'

export interface Cell {
  type: CellType
  resourceAmount?: number
}

export type ActionType =
  | 'move'
  | 'gather'
  | 'attack'
  | 'defend'
  | 'heal'
  | 'offer-alliance'
  | 'accept-alliance'
  | 'reject-alliance'
  | 'support-ally'
  | 'betray-ally'
  | 'idle'

export interface AgentAction {
  type: ActionType
  targetId?: string
  targetPos?: Position
}

export interface AgentTraits {
  aggression: number    // 0-1: likelihood to attack
  trust: number        // 0-1: willingness to form alliances
  loyalty: number      // 0-1: resistance to betrayal
  greed: number        // 0-1: priority on resource gathering
  riskTolerance: number // 0-1: willingness to take risky actions
  memory: number       // 0-1: how long they remember past interactions
  irrationality: number // 0-1: deviation from optimal decisions
}

export interface RelationEntry {
  trust: number          // -1 to 1
  resentment: number     // 0 to 1
  allied: boolean
  allianceTick: number
  interactionCount: number
  lastOfferTick: number  // cooldown: don't spam alliance offers
}

export interface AgentState {
  id: string
  name: string
  position: Position
  prevPosition: Position
  resources: number
  health: number
  alive: boolean
  traits: AgentTraits
  relations: Record<string, RelationEntry>
  defending: boolean
  color: string
}

export interface WorldConfig {
  width: number
  height: number
  agentCount: number
  resourceDensity: number  // 0-1
  obstacleDensity: number  // 0-1
  defaultTraits: Partial<AgentTraits>
}

export interface SimulationConfig {
  world: WorldConfig
  tickIntervalMs: number
  maxTicks: number
}

export interface EventLogEntry {
  tick: number
  agentId: string
  agentName: string
  action: ActionType
  targetId?: string
  targetName?: string
  description: string
}

export interface SimulationState {
  tick: number
  running: boolean
  agents: AgentState[]
  grid: Cell[][]
  events: EventLogEntry[]
  config: SimulationConfig
  winners: AgentState[]      // 1 = solo win, 2+ = alliance win
  story: string[]
  standoffSince: number      // tick when all survivors became allied (0 = no standoff)
  draw: boolean              // true when all agents die simultaneously
}
