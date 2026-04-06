import {
  AgentAction,
  AgentState,
  AgentTraits,
  Cell,
  Position,
  RelationEntry,
} from './types'
import { adjacentPositions, clamp, distance, randomFloat, shuffle } from './utils'

const DEFAULT_TRAITS: AgentTraits = {
  aggression: 0.3,
  trust: 0.5,
  loyalty: 0.5,
  greed: 0.5,
  riskTolerance: 0.4,
  memory: 0.5,
  irrationality: 0.1,
}

export function createAgent(
  id: string,
  name: string,
  position: Position,
  color: string,
  traitOverrides: Partial<AgentTraits> = {}
): AgentState {
  return {
    id,
    name,
    position,
    resources: 0,
    health: 100,
    alive: true,
    traits: { ...DEFAULT_TRAITS, ...traitOverrides },
    relations: {},
    defending: false,
    color,
  }
}

export function getOrInitRelation(agent: AgentState, targetId: string): RelationEntry {
  if (!agent.relations[targetId]) {
    agent.relations[targetId] = {
      trust: 0,
      resentment: 0,
      allied: false,
      allianceTick: 0,
      interactionCount: 0,
    }
  }
  return agent.relations[targetId]
}

export function decideAction(
  agent: AgentState,
  allAgents: AgentState[],
  grid: Cell[][],
  _tick: number
): AgentAction {
  const { traits } = agent
  const width = grid[0].length
  const height = grid.length

  const noise = () => (Math.random() - 0.5) * traits.irrationality

  const liveEnemies = allAgents.filter(a => a.alive && a.id !== agent.id)
  const occupied = new Set(liveEnemies.map(a => `${a.position.x},${a.position.y}`))
  const adjPositions = adjacentPositions(agent.position, width, height)

  // Check adjacent resources
  const resourceAdj = adjPositions.find(
    p => grid[p.y][p.x].type === 'resource'
  )

  // Nearby agents (within 4 tiles)
  const nearbyAgents = liveEnemies.filter(a => distance(a.position, agent.position) <= 4)

  // Alliance opportunities
  const potentialAllies = nearbyAgents.filter(a => {
    const rel = agent.relations[a.id]
    return !rel?.allied && (rel?.trust ?? 0) > 0.3
  })

  // Betrayal candidates
  const betrayalCandidates = liveEnemies.filter(a => {
    const rel = agent.relations[a.id]
    return rel?.allied && (1 - traits.loyalty + noise()) > 0.6 && a.resources > agent.resources * 0.5
  })

  // Attack candidates adjacent
  const attackCandidates = nearbyAgents.filter(a => {
    const rel = agent.relations[a.id]
    if (rel?.allied) return false
    return distance(a.position, agent.position) === 1
  })

  // --- Utility scoring ---
  const gatherUtility = resourceAdj ? traits.greed + noise() : 0
  const attackUtility =
    attackCandidates.length > 0 ? traits.aggression * traits.riskTolerance + noise() : 0
  const allianceUtility =
    potentialAllies.length > 0 ? traits.trust * 0.6 + noise() : 0
  const betrayUtility =
    betrayalCandidates.length > 0
      ? (1 - traits.loyalty) * traits.greed + noise()
      : 0
  const moveUtility = 0.3 + noise()

  const best = Math.max(gatherUtility, attackUtility, allianceUtility, betrayUtility, moveUtility)

  if (best === gatherUtility && resourceAdj) {
    return { type: 'gather', targetPos: resourceAdj }
  }

  if (best === betrayUtility && betrayalCandidates.length > 0) {
    return { type: 'betray-ally', targetId: betrayalCandidates[0].id }
  }

  if (best === attackUtility && attackCandidates.length > 0) {
    const target = attackCandidates.sort((a, b) => a.health - b.health)[0]
    return { type: 'attack', targetId: target.id }
  }

  if (best === allianceUtility && potentialAllies.length > 0) {
    return { type: 'offer-alliance', targetId: potentialAllies[0].id }
  }

  // Move: toward resource, enemy (if aggressive), or wander
  const moveTarget = findMoveTarget(agent, grid, liveEnemies, occupied, width, height)
  return { type: 'move', targetPos: moveTarget }
}

function findMoveTarget(
  agent: AgentState,
  grid: Cell[][],
  liveAgents: AgentState[],
  occupied: Set<string>,
  width: number,
  height: number
): Position {
  // Free adjacent cells (not obstacle, not occupied by another agent)
  const freeAdj = adjacentPositions(agent.position, width, height).filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`)
  )

  // Any adjacent cell that could unblock (include occupied if nothing else)
  const walkableAdj = adjacentPositions(agent.position, width, height).filter(
    p => grid[p.y][p.x].type !== 'obstacle'
  )

  const candidates = freeAdj.length > 0 ? freeAdj : walkableAdj

  if (candidates.length === 0) return agent.position

  // 1. Move toward nearest resource
  let bestTarget: Position | null = null
  let bestDist = Infinity
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x].type === 'resource') {
        const d = distance({ x, y }, agent.position)
        if (d < bestDist) {
          bestDist = d
          bestTarget = { x, y }
        }
      }
    }
  }

  if (bestTarget) {
    return candidates.sort((a, b) => distance(a, bestTarget!) - distance(b, bestTarget!))[0]
  }

  // 2. No resources — aggressive agents chase nearest enemy, others wander
  if (agent.traits.aggression > 0.4 && liveAgents.length > 0) {
    const nearestEnemy = liveAgents
      .filter(a => !agent.relations[a.id]?.allied)
      .sort((a, b) => distance(a.position, agent.position) - distance(b.position, agent.position))[0]
    if (nearestEnemy) {
      return candidates.sort(
        (a, b) => distance(a, nearestEnemy.position) - distance(b, nearestEnemy.position)
      )[0]
    }
  }

  // 3. Wander randomly
  return shuffle(candidates)[0]
}

export function updateRelations(agent: AgentState, _tick: number): void {
  const memoryDecay = 1 - agent.traits.memory * 0.005
  for (const rel of Object.values(agent.relations)) {
    rel.trust = clamp(rel.trust * memoryDecay, -1, 1)
    rel.resentment = clamp(rel.resentment * memoryDecay, 0, 1)
  }
}

export function modifyTrust(
  agent: AgentState,
  targetId: string,
  delta: number
): void {
  const rel = getOrInitRelation(agent, targetId)
  rel.trust = clamp(rel.trust + delta, -1, 1)
  rel.interactionCount++
}

export function modifyResentment(
  agent: AgentState,
  targetId: string,
  delta: number
): void {
  const rel = getOrInitRelation(agent, targetId)
  rel.resentment = clamp(rel.resentment + delta, 0, 1)
}

export function randomizeTraits(base: Partial<AgentTraits> = {}): AgentTraits {
  const rand = () => clamp(randomFloat(0, 1), 0, 1)
  return {
    aggression: base.aggression ?? rand(),
    trust: base.trust ?? rand(),
    loyalty: base.loyalty ?? rand(),
    greed: base.greed ?? rand(),
    riskTolerance: base.riskTolerance ?? rand(),
    memory: base.memory ?? rand(),
    irrationality: base.irrationality ?? clamp(randomFloat(0, 0.4), 0, 1),
  }
}
