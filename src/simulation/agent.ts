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

// How long before an agent can re-offer alliance to the same person after rejection
const OFFER_COOLDOWN = 40

// After an alliance lasts this many ticks, betrayal pressure starts building
const ALLIANCE_PRESSURE_START = 60

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
    prevPosition: { ...position },
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
      lastOfferTick: 0,
    }
  }
  return agent.relations[targetId]
}

export function decideAction(
  agent: AgentState,
  allAgents: AgentState[],
  grid: Cell[][],
  tick: number,
  standoffPressure: number // 0-1, increases betrayal temptation
): AgentAction {
  const { traits } = agent
  const width = grid[0].length
  const height = grid.length

  const noise = () => (Math.random() - 0.5) * traits.irrationality * 2

  const liveOthers = allAgents.filter(a => a.alive && a.id !== agent.id)
  const occupied = new Set(liveOthers.map(a => `${a.position.x},${a.position.y}`))
  const adjPositions = adjacentPositions(agent.position, width, height)

  // Adjacent resource
  const resourceAdj = adjPositions.find(p => grid[p.y][p.x].type === 'resource')

  // Nearby agents (within 4 tiles)
  const nearbyOthers = liveOthers.filter(a => distance(a.position, agent.position) <= 4)

  // Alliance offers: respect cooldown (only applies after first offer, not to new contacts)
  const potentialAllies = nearbyOthers.filter(a => {
    const rel = agent.relations[a.id]
    if (rel?.allied) return false
    if (rel?.lastOfferTick && tick - rel.lastOfferTick < OFFER_COOLDOWN) return false
    return (rel?.trust ?? 0) > 0.2 || traits.trust > 0.65
  })

  // Betrayal: old alliances get pressure from standoff and time
  const betrayalCandidates = liveOthers.filter(a => {
    const rel = agent.relations[a.id]
    if (!rel?.allied) return false
    const allianceAge = tick - rel.allianceTick
    const agePressure = Math.max(0, (allianceAge - ALLIANCE_PRESSURE_START) / 100)
    const totalPressure = clamp((1 - traits.loyalty) + agePressure + standoffPressure * 0.5 + noise(), 0, 1)
    return totalPressure > 0.55
  })

  // Attack: adjacent non-allied enemies
  const attackCandidates = nearbyOthers.filter(a => {
    if (agent.relations[a.id]?.allied) return false
    return distance(a.position, agent.position) === 1
  })

  // Resentment toward an adjacent attacker raises effective aggression (wounded agents fight back)
  const adjEnemy = attackCandidates[0]
  const resentmentBoost = adjEnemy ? (agent.relations[adjEnemy.id]?.resentment ?? 0) * 0.4 : 0

  // Utility scoring
  // Attack has a base floor (0.25) so even passive agents fight adjacent enemies.
  // Aggression and resentment raise it further.
  const gatherUtility = resourceAdj ? traits.greed + noise() : 0
  const attackUtility = attackCandidates.length > 0
    ? 0.25 + traits.aggression * 0.65 + resentmentBoost + noise()
    : 0
  const allianceUtility = potentialAllies.length > 0 ? traits.trust * 0.5 + noise() : 0
  const betrayUtility = betrayalCandidates.length > 0
    ? (1 - traits.loyalty) * 0.7 + standoffPressure * 0.3 + noise()
    : 0
  const moveUtility = 0.35 + noise()

  const best = Math.max(gatherUtility, attackUtility, allianceUtility, betrayUtility, moveUtility)

  if (best === gatherUtility && resourceAdj) {
    return { type: 'gather', targetPos: resourceAdj }
  }

  if (best === betrayUtility && betrayalCandidates.length > 0) {
    // Betray whoever has the most resources
    const target = betrayalCandidates.sort((a, b) => b.resources - a.resources)[0]
    return { type: 'betray-ally', targetId: target.id }
  }

  if (best === attackUtility && attackCandidates.length > 0) {
    const target = attackCandidates.sort((a, b) => a.health - b.health)[0]
    return { type: 'attack', targetId: target.id }
  }

  if (best === allianceUtility && potentialAllies.length > 0) {
    return { type: 'offer-alliance', targetId: potentialAllies[0].id }
  }

  const moveTarget = findMoveTarget(agent, grid, liveOthers, occupied, width, height)
  return { type: 'move', targetPos: moveTarget }
}

function findMoveTarget(
  agent: AgentState,
  grid: Cell[][],
  liveOthers: AgentState[],
  occupied: Set<string>,
  width: number,
  height: number
): Position {
  const prev = agent.prevPosition
  const isPrev = (p: Position) => p.x === prev.x && p.y === prev.y

  // Free cells: not obstacle, not occupied, not where we just came from.
  // Excluding prevPosition breaks diagonal oscillation: if both agents try to swap
  // positions, each refuses to step back to where they were last tick.
  const freeAdj = adjacentPositions(agent.position, width, height).filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`) && !isPrev(p)
  )
  // Fallbacks: allow prev if truly no other option
  const freeAdjWithPrev = adjacentPositions(agent.position, width, height).filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`)
  )
  const walkableAdj = adjacentPositions(agent.position, width, height).filter(
    p => grid[p.y][p.x].type !== 'obstacle'
  )

  const candidates = freeAdj.length > 0 ? freeAdj
    : freeAdjWithPrev.length > 0 ? freeAdjWithPrev
    : walkableAdj

  if (candidates.length === 0) return agent.position

  // 1. Move toward nearest resource
  let nearestResource: Position | null = null
  let nearestResourceDist = Infinity
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x].type === 'resource') {
        const d = distance({ x, y }, agent.position)
        if (d < nearestResourceDist) {
          nearestResourceDist = d
          nearestResource = { x, y }
        }
      }
    }
  }
  if (nearestResource) {
    return candidates.sort((a, b) => distance(a, nearestResource!) - distance(b, nearestResource!))[0]
  }

  // 2. No resources: move toward nearest non-allied enemy
  const enemies = liveOthers.filter(a => !agent.relations[a.id]?.allied)
  if (enemies.length > 0) {
    const nearest = enemies.sort(
      (a, b) => distance(a.position, agent.position) - distance(b.position, agent.position)
    )[0]
    return candidates.sort(
      (a, b) => distance(a, nearest.position) - distance(b, nearest.position)
    )[0]
  }

  // 3. Standoff: wander among allies
  return shuffle(candidates)[0]
}

export function updateRelations(agent: AgentState): void {
  const memoryDecay = 1 - agent.traits.memory * 0.004
  for (const rel of Object.values(agent.relations)) {
    rel.trust = clamp(rel.trust * memoryDecay, -1, 1)
    rel.resentment = clamp(rel.resentment * memoryDecay, 0, 1)
  }
}

export function modifyTrust(agent: AgentState, targetId: string, delta: number): void {
  const rel = getOrInitRelation(agent, targetId)
  rel.trust = clamp(rel.trust + delta, -1, 1)
  rel.interactionCount++
}

export function modifyResentment(agent: AgentState, targetId: string, delta: number): void {
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
    irrationality: base.irrationality ?? clamp(randomFloat(0, 0.35), 0, 1),
  }
}
