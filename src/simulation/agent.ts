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

const OFFER_COOLDOWN = 50
const RESOURCE_WIN_THRESHOLD = 100
const HEAL_COST = 20
const HEAL_AMOUNT = 30
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
  standoffPressure: number
): AgentAction {
  const { traits } = agent
  const width = grid[0].length
  const height = grid.length

  const noise = () => (Math.random() - 0.5) * traits.irrationality * 2

  // Irrationality: highly irrational agents occasionally act randomly
  if (Math.random() < traits.irrationality * 0.12) {
    const freeAdj = adjacentPositions(agent.position, width, height).filter(
      p => grid[p.y][p.x].type !== 'obstacle'
    )
    if (freeAdj.length > 0) return { type: 'move', targetPos: shuffle(freeAdj)[0] }
  }

  const liveOthers = allAgents.filter(a => a.alive && a.id !== agent.id)
  const occupied = new Set(liveOthers.map(a => `${a.position.x},${a.position.y}`))
  const adjPositions = adjacentPositions(agent.position, width, height)

  const resourceAdj = adjPositions.find(p => grid[p.y][p.x].type === 'resource')
  const resourceProgress = agent.resources / RESOURCE_WIN_THRESHOLD

  // Nearby agents (within 5 tiles)
  const nearbyOthers = liveOthers.filter(a => distance(a.position, agent.position) <= 5)
  const nearbyAllies = nearbyOthers.filter(a => agent.relations[a.id]?.allied)
  const nearbyEnemies = nearbyOthers.filter(a => !agent.relations[a.id]?.allied)

  // --- Alliance offers ---
  // Only genuinely trusting (gullible) agents initiate; heavy distrust blocks re-alliancing
  const potentialAllies = nearbyOthers.filter(a => {
    const rel = agent.relations[a.id]
    if (rel?.allied) return false
    if (rel?.lastOfferTick && tick - rel.lastOfferTick < OFFER_COOLDOWN) return false
    if ((rel?.trust ?? 0) < -0.2) return false
    return traits.trust > 0.55
  })

  // --- Betrayal ---
  // Greed tempts betrayal when ally has far more resources than self
  const betrayalCandidates = liveOthers.filter(a => {
    const rel = agent.relations[a.id]
    if (!rel?.allied) return false
    const allianceAge = tick - rel.allianceTick
    const agePressure = Math.max(0, (allianceAge - ALLIANCE_PRESSURE_START) / 100)
    const greedTemptation = traits.greed * Math.max(0, (a.resources - agent.resources) / 60) * 0.35
    const totalPressure = clamp(
      (1 - traits.loyalty) + agePressure + standoffPressure * 0.5 + greedTemptation + noise(),
      0, 1
    )
    return totalPressure > 0.55
  })

  // --- Attack ---
  const attackCandidates = nearbyOthers.filter(a => {
    if (agent.relations[a.id]?.allied) return false
    return distance(a.position, agent.position) === 1
  })

  const adjEnemy = attackCandidates[0]
  const resentmentBoost = adjEnemy ? (agent.relations[adjEnemy.id]?.resentment ?? 0) * 0.4 : 0
  const richEnemyThreat = attackCandidates.reduce(
    (max, a) => Math.max(max, a.resources / RESOURCE_WIN_THRESHOLD), 0
  )
  // Cowardly agents penalise attack when outnumbered
  const allyCount = nearbyAllies.filter(a => distance(a.position, agent.position) <= 2).length
  const outnumberedPenalty = attackCandidates.length > allyCount + 1
    ? (1 - traits.riskTolerance) * 0.25
    : 0

  // --- Heal ---
  const canHeal = agent.resources >= HEAL_COST && agent.health < 65
  const healUtility = canHeal
    ? (1 - agent.health / 100) * (1 - traits.riskTolerance * 0.5) * 0.95 + noise()
    : 0

  // --- Flee ---
  const nearestThreat = nearbyEnemies
    .sort((a, b) => distance(a.position, agent.position) - distance(b.position, agent.position))[0]
  const inDanger = !!nearestThreat && distance(nearestThreat.position, agent.position) <= 3 && agent.health < 45
  const fleeScore = inDanger
    ? (1 - traits.riskTolerance) * 0.6 + (1 - traits.irrationality) * 0.4
    : 0
  const fleeUtility = fleeScore > 0.45
    ? fleeScore + (1 - agent.health / 100) * 0.2 + noise()
    : 0

  // --- Support ally ---
  // Loyal agents move to stand beside allies who are being attacked
  const alliesUnderAttack = nearbyAllies.filter(ally => {
    const allyEnemiesAdj = liveOthers.filter(
      e => !ally.relations[e.id]?.allied && distance(e.position, ally.position) === 1
    )
    return allyEnemiesAdj.length > 0 && distance(ally.position, agent.position) <= 6
  })
  const supportTarget = alliesUnderAttack
    .sort((a, b) => a.health - b.health)[0]  // prioritise most wounded ally
  const supportUtility = supportTarget
    ? traits.loyalty * 0.55 + Math.max(0, agent.relations[supportTarget.id]?.trust ?? 0) * 0.25 + noise()
    : 0

  // --- Share resources ---
  // Loyal, ungreedy agents share with allies who have significantly fewer resources
  const shareCandidate = nearbyAllies
    .filter(a =>
      distance(a.position, agent.position) <= 2 &&
      agent.resources > 25 &&
      a.resources < agent.resources * 0.55
    )
    .sort((a, b) => a.resources - b.resources)[0]
  const shareUtility = shareCandidate
    ? traits.loyalty * 0.45 + (1 - traits.greed) * 0.35 + noise()
    : 0

  // --- Utility scores ---
  const gatherUrgency = Math.min(1, resourceProgress) * 0.6
  const gatherUtility = resourceAdj ? traits.greed + gatherUrgency + noise() : 0

  const attackUtility = attackCandidates.length > 0
    ? 0.25 + traits.aggression * 0.65 + resentmentBoost + richEnemyThreat * 0.3 - outnumberedPenalty + noise()
    : 0

  const allianceUtility = potentialAllies.length > 0 ? traits.trust * 0.8 + noise() : 0

  const betrayUtility = betrayalCandidates.length > 0
    ? (1 - traits.loyalty) * 0.7 + standoffPressure * 0.3 + noise()
    : 0

  const moveUtility = 0.3 + gatherUrgency * 0.2 + noise()

  const best = Math.max(
    gatherUtility, attackUtility, allianceUtility, betrayUtility,
    healUtility, fleeUtility, supportUtility, shareUtility, moveUtility
  )

  if (best === fleeUtility && nearestThreat) {
    return { type: 'move', targetPos: findFleeTarget(agent, nearestThreat.position, grid, occupied, width, height) }
  }

  if (best === gatherUtility && resourceAdj) {
    return { type: 'gather', targetPos: resourceAdj }
  }

  if (best === betrayUtility && betrayalCandidates.length > 0) {
    const target = betrayalCandidates.sort((a, b) => b.resources - a.resources)[0]
    return { type: 'betray-ally', targetId: target.id }
  }

  if (best === attackUtility && attackCandidates.length > 0) {
    // riskTolerance determines target preference: brave → attack strongest, cautious → finish weakest
    const target = attackCandidates.sort((a, b) =>
      traits.riskTolerance > 0.6
        ? (b.resources - a.resources) + (b.health - a.health) * 0.3   // brave: rich & healthy targets
        : (a.health - b.health) + (b.resources - a.resources) * 0.3   // cautious: weakened targets
    )[0]
    return { type: 'attack', targetId: target.id }
  }

  if (best === healUtility && canHeal) {
    return { type: 'heal' }
  }

  if (best === shareUtility && shareCandidate) {
    return { type: 'share', targetId: shareCandidate.id }
  }

  if (best === supportUtility && supportTarget) {
    // If already adjacent, emit support-ally; otherwise move toward them
    if (distance(supportTarget.position, agent.position) <= 1) {
      return { type: 'support-ally', targetId: supportTarget.id }
    }
    const freeAdj = adjacentPositions(agent.position, width, height).filter(
      p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`)
    )
    if (freeAdj.length > 0) {
      const toward = freeAdj.sort(
        (a, b) => distance(a, supportTarget.position) - distance(b, supportTarget.position)
      )[0]
      return { type: 'move', targetPos: toward }
    }
  }

  if (best === allianceUtility && potentialAllies.length > 0) {
    return { type: 'offer-alliance', targetId: potentialAllies[0].id }
  }

  return { type: 'move', targetPos: findMoveTarget(agent, grid, liveOthers, occupied, width, height, resourceProgress) }
}

function findFleeTarget(
  agent: AgentState,
  threatPos: Position,
  grid: Cell[][],
  occupied: Set<string>,
  width: number,
  height: number
): Position {
  const prev = agent.prevPosition
  const adj = adjacentPositions(agent.position, width, height)
  const free = adj.filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`) && !(p.x === prev.x && p.y === prev.y)
  )
  const candidates = free.length > 0
    ? free
    : adj.filter(p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`))
  if (candidates.length === 0) return agent.position
  return candidates.sort((a, b) => distance(b, threatPos) - distance(a, threatPos))[0]
}

function findMoveTarget(
  agent: AgentState,
  grid: Cell[][],
  liveOthers: AgentState[],
  occupied: Set<string>,
  width: number,
  height: number,
  resourceProgress = 0
): Position {
  const prev = agent.prevPosition
  const isPrev = (p: Position) => p.x === prev.x && p.y === prev.y

  const freeAdj = adjacentPositions(agent.position, width, height).filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`) && !isPrev(p)
  )
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

  // 1. Memory-based resource scan: high-memory agents see further
  const scanRadius = Math.max(3, Math.round(agent.traits.memory * 15))
  let nearestResource: Position | null = null
  let nearestResourceDist = Infinity
  for (let dy = -scanRadius; dy <= scanRadius; dy++) {
    for (let dx = -scanRadius; dx <= scanRadius; dx++) {
      const nx = agent.position.x + dx
      const ny = agent.position.y + dy
      if (grid[ny]?.[nx]?.type === 'resource') {
        const d = Math.abs(dx) + Math.abs(dy)
        if (d < nearestResourceDist) {
          nearestResourceDist = d
          nearestResource = { x: nx, y: ny }
        }
      }
    }
  }
  // Fall back to last known position if high-enough memory and nothing currently visible
  if (!nearestResource && agent.lastKnownResourcePos && agent.traits.memory > 0.4) {
    nearestResource = agent.lastKnownResourcePos
  }
  if (nearestResource) {
    return candidates.sort((a, b) => distance(a, nearestResource!) - distance(b, nearestResource!))[0]
  }

  // 2. No resources: high-aggression agents always chase enemies; others only when close to winning
  const enemies = liveOthers.filter(a => !agent.relations[a.id]?.allied)
  if (enemies.length > 0 && (agent.traits.aggression > 0.55 || resourceProgress > 0.5)) {
    const target = resourceProgress > 0.5
      ? enemies.sort((a, b) => b.resources - a.resources)[0]  // hunt richest threat
      : enemies.sort((a, b) => distance(a.position, agent.position) - distance(b.position, agent.position))[0]
    return candidates.sort((a, b) => distance(a, target.position) - distance(b, target.position))[0]
  }

  // 3. Low aggression with no resources: wander
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
