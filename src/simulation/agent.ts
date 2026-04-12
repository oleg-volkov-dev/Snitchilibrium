import {
  AgentAction,
  AgentState,
  AgentTraits,
  Cell,
  Position,
  RelationEntry,
} from './types'
import { adjacentPositions, clamp, distance, randomFloat, shuffle, getSafeRadius, DEATH_ZONE_START } from './utils'

const DEFAULT_TRAITS: AgentTraits = {
  aggression: 0.3,
  trust: 0.5,
  loyalty: 0.5,
  greed: 0.5,
  riskTolerance: 0.4,
  memory: 0.5,
  irrationality: 0.1,
  intellect: 0.5,
}

const OFFER_COOLDOWN = 50
const RESOURCE_WIN_THRESHOLD = 100
const HEAL_COST = 20

// Vision radius in grid tiles — compressed to [3, 6] so memory isn't overwhelmingly dominant.
// Memory's primary role is now retention of trust/resentment and resource recall.
export function getVisionRadius(memory: number): number {
  return Math.round(3 + memory * 3)  // range [3, 6]
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
    prevPosition: { ...position },
    positionHistory: [],
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
  standoffPressure: number,
  deathZoneStart = DEATH_ZONE_START
): AgentAction {
  const { traits } = agent
  const width = grid[0].length
  const height = grid.length

  // Intellect suppresses noise — a smart agent has tighter, more consistent decisions.
  // A chaotic-but-smart agent still acts randomly but within coherent goal ranges.
  const noise = () =>
    (Math.random() - 0.5) * traits.irrationality * 2 * (1 - traits.intellect * 0.7)

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

  // Vision radius (memory-driven, compressed to [3, 6])
  const visionRadius = getVisionRadius(traits.memory)
  const allyAgents = liveOthers.filter(a => agent.relations[a.id]?.allied)
  const nearbyOthers = liveOthers.filter(a => {
    if (distance(a.position, agent.position) <= visionRadius) return true
    return allyAgents.some(ally => distance(a.position, ally.position) <= getVisionRadius(ally.traits.memory))
  })
  const nearbyAllies = nearbyOthers.filter(a => agent.relations[a.id]?.allied)
  const nearbyEnemies = nearbyOthers.filter(a => !agent.relations[a.id]?.allied)

  // --- Alliance offers ---
  // Soft trust threshold replaces hard 0.55 cutoff: low-trust agents very rarely offer,
  // mid-trust agents offer sometimes, high-trust agents almost always do.
  // Intellect vets potential allies — smart agents avoid obvious betrayers.
  const potentialAllies = nearbyOthers.filter(a => {
    const rel = agent.relations[a.id]
    if (rel?.allied) return false
    if (rel?.lastOfferTick && tick - rel.lastOfferTick < OFFER_COOLDOWN) return false
    if ((rel?.trust ?? 0) < -0.2) return false
    if (traits.trust < 0.3) return false
    if (traits.trust < 0.7 && Math.random() > (traits.trust - 0.3) / 0.4) return false
    // Smart agents detect likely betrayers: high greed + low loyalty = red flag
    if (traits.intellect > 0.5) {
      const betrayalRisk = a.traits.greed * (1 - a.traits.loyalty)
      if (betrayalRisk > 0.45 && Math.random() < (traits.intellect - 0.5) * 1.6) return false
    }
    return true
  })

  // --- Betrayal ---
  const betrayalCandidates = liveOthers.filter(a => {
    const rel = agent.relations[a.id]
    if (!rel?.allied) return false
    const allianceAge = tick - rel.allianceTick
    const agePressure = Math.max(0, (allianceAge - 150) / 400)
    const resourceGain = Math.max(0, a.resources - Math.max(agent.resources, 10))
    const greedTemptation = traits.greed * Math.min(1, resourceGain / 60)
    const rawPressure = agePressure + greedTemptation * 0.7 + standoffPressure * 0.45
    const threshold = 0.3 + traits.loyalty * 0.65
    return rawPressure + noise() * 0.25 > threshold
  })

  // --- Attack ---
  const attackCandidates = nearbyOthers.filter(a => {
    if (agent.relations[a.id]?.allied) return false
    return distance(a.position, agent.position) === 1
  })

  const adjEnemy = attackCandidates[0]
  const resentmentBoost = adjEnemy ? (agent.relations[adjEnemy.id]?.resentment ?? 0) * 0.4 : 0

  // Intellect scales how strongly an agent reacts to enemies close to winning.
  // A genius recognises a near-winner as an existential threat and prioritises the kill.
  const richEnemyThreat = attackCandidates.reduce(
    (max, a) => Math.max(max, a.resources / RESOURCE_WIN_THRESHOLD), 0
  )
  const threatWeight = 0.1 + traits.intellect * 0.6  // [0.1, 0.7]

  const allyCount = nearbyAllies.filter(a => distance(a.position, agent.position) <= 2).length
  const outnumberedPenalty = attackCandidates.length > allyCount + 1
    ? (1 - traits.riskTolerance) * 0.25
    : 0

  // --- Heal ---
  // Risk tolerance sets the HP threshold at which healing feels worthwhile.
  // Cowards (low risk) heal early; berserkers (high risk) only heal when nearly dead.
  const healThreshold = 30 + (1 - traits.riskTolerance) * 45  // [30 HP, 75 HP]
  const canHeal = agent.resources >= HEAL_COST && agent.health < healThreshold
  const healUtility = canHeal
    ? (1 - agent.health / 100) * (1 - traits.riskTolerance * 0.8) * 0.95 + noise()
    : 0

  // --- Flee ---
  // Risk tolerance sets the HP danger threshold and the urgency of fleeing.
  const fleeHealthThreshold = 20 + (1 - traits.riskTolerance) * 60  // [20 HP, 80 HP]
  const nearestThreat = nearbyEnemies
    .sort((a, b) => distance(a.position, agent.position) - distance(b.position, agent.position))[0]
  const inDanger = !!nearestThreat
    && distance(nearestThreat.position, agent.position) <= 3
    && agent.health < fleeHealthThreshold
  const fleeScore = inDanger
    ? (1 - traits.riskTolerance) * 0.6 + (1 - traits.irrationality) * 0.4
    : 0
  const fleeUtility = fleeScore > 0.35
    ? fleeScore + (1 - agent.health / 100) * 0.2 + noise()
    : 0

  // --- Support ally ---
  const alliesUnderAttack = nearbyAllies.filter(ally => {
    const allyEnemiesAdj = liveOthers.filter(
      e => !ally.relations[e.id]?.allied && distance(e.position, ally.position) === 1
    )
    return allyEnemiesAdj.length > 0 && distance(ally.position, agent.position) <= 6
  })
  const supportTarget = alliesUnderAttack
    .sort((a, b) => a.health - b.health)[0]
  const supportUtility = supportTarget
    ? traits.loyalty * 0.55 + Math.max(0, agent.relations[supportTarget.id]?.trust ?? 0) * 0.25 + noise()
    : 0

  // --- Share resources ---
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

  // --- Death zone avoidance ---
  // If the agent is currently outside the safe radius they should actively flee toward center.
  // Utility is high enough to override idle wandering but not necessarily active combat/healing.
  const dzRadius = getSafeRadius(tick, width, height, deathZoneStart)
  const dzCx = (width - 1) / 2
  const dzCy = (height - 1) / 2
  const dzDistFromCenter = Math.sqrt(
    (agent.position.x - dzCx) ** 2 + (agent.position.y - dzCy) ** 2
  )
  const inDeathZone = dzRadius !== Infinity && dzDistFromCenter > dzRadius
  // Very greedy agents near the win threshold may sacrifice HP to collect zone resources.
  // They suppress the normal flee-the-zone behaviour unless health drops critically low.
  const greedyDash = traits.greed > 0.7 && resourceProgress > 0.6
  const dzFleeUtility = inDeathZone && !greedyDash
    ? 0.5 + (1 - traits.riskTolerance) * 0.3 + (1 - agent.health / 100) * 0.25 + noise()
    : inDeathZone && agent.health < 30   // even dashers bail when nearly dead
      ? 0.9 + noise()
      : 0

  // --- Utility scores ---
  const gatherUrgency = Math.min(1, resourceProgress) * 0.6
  const gatherUtility = resourceAdj ? traits.greed + gatherUrgency + noise() : 0

  // Risk tolerance adds a direct eagerness-to-fight bonus on top of aggression.
  const attackUtility = attackCandidates.length > 0
    ? 0.25
      + traits.aggression * 0.65
      + traits.riskTolerance * 0.3
      + resentmentBoost
      + richEnemyThreat * threatWeight
      - outnumberedPenalty
      + noise()
    : 0

  const allianceUtility = potentialAllies.length > 0 ? traits.trust * 0.8 + noise() : 0

  const betrayGain = betrayalCandidates.reduce((max, a) => Math.max(max, a.resources), 0)
  const betrayUtility = betrayalCandidates.length > 0
    ? (1 - traits.loyalty) * 0.3
      + Math.min(1, betrayGain / RESOURCE_WIN_THRESHOLD) * 0.5
      + standoffPressure * 0.3
      + noise()
    : 0

  const moveUtility = 0.3 + gatherUrgency * 0.2 + noise()

  const best = Math.max(
    gatherUtility, attackUtility, allianceUtility, betrayUtility,
    healUtility, fleeUtility, supportUtility, shareUtility, moveUtility, dzFleeUtility
  )

  if (best === dzFleeUtility && inDeathZone) {
    return { type: 'move', targetPos: findDeathZoneFleeTarget(agent, grid, occupied, width, height) }
  }

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
    const target = attackCandidates.sort((a, b) =>
      traits.riskTolerance > 0.6
        ? (b.resources - a.resources) + (b.health - a.health) * 0.3
        : (a.health - b.health) + (b.resources - a.resources) * 0.3
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

  return { type: 'move', targetPos: findMoveTarget(agent, grid, liveOthers, allyAgents, occupied, width, height, resourceProgress, dzRadius, greedyDash) }
}

function findDeathZoneFleeTarget(
  agent: AgentState,
  grid: Cell[][],
  occupied: Set<string>,
  width: number,
  height: number
): Position {
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const adj = adjacentPositions(agent.position, width, height)
  const walkable = adj.filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`)
  )
  if (walkable.length === 0) return agent.position
  // Pick the step that brings us closest to center (euclidean)
  return walkable.sort((a, b) => {
    const da = Math.sqrt((a.x - cx) ** 2 + (a.y - cy) ** 2)
    const db = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2)
    return da - db
  })[0]
}

function findFleeTarget(
  agent: AgentState,
  threatPos: Position,
  grid: Cell[][],
  occupied: Set<string>,
  width: number,
  height: number
): Position {
  const recentSet = new Set(agent.positionHistory.map(p => `${p.x},${p.y}`))
  const adj = adjacentPositions(agent.position, width, height)
  const free = adj.filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`) && !recentSet.has(`${p.x},${p.y}`)
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
  allies: AgentState[],
  occupied: Set<string>,
  width: number,
  height: number,
  resourceProgress = 0,
  dzRadius = Infinity,
  greedyDash = false
): Position {
  const recentSet = new Set(agent.positionHistory.map(p => `${p.x},${p.y}`))

  const adj = adjacentPositions(agent.position, width, height)
  const freeAdj = adj.filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`) && !recentSet.has(`${p.x},${p.y}`)
  )
  const freeAdjWithRecent = adj.filter(
    p => grid[p.y][p.x].type !== 'obstacle' && !occupied.has(`${p.x},${p.y}`)
  )
  const walkableAdj = adj.filter(p => grid[p.y][p.x].type !== 'obstacle')
  const candidates = freeAdj.length > 0 ? freeAdj
    : freeAdjWithRecent.length > 0 ? freeAdjWithRecent
    : walkableAdj

  if (candidates.length === 0) return agent.position

  // Resource scan: own vision + shared ally vision.
  // Intellect weights selection by value-per-distance rather than just nearest.
  const scanPoints: { pos: Position; radius: number }[] = [
    { pos: agent.position, radius: getVisionRadius(agent.traits.memory) },
    ...allies.map(a => ({ pos: a.position, radius: getVisionRadius(a.traits.memory) })),
  ]
  let nearestResource: Position | null = null
  let bestScore = -Infinity
  for (const { pos: origin, radius } of scanPoints) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = origin.x + dx
        const ny = origin.y + dy
        if (grid[ny]?.[nx]?.type === 'resource') {
          // Skip resources inside the death zone — agents won't chase them into danger.
          // Exception: greedy near-winners may dash in for a high-value pickup.
          if (!greedyDash && dzRadius !== Infinity) {
            const rCx = (width - 1) / 2
            const rCy = (height - 1) / 2
            if (Math.sqrt((nx - rCx) ** 2 + (ny - rCy) ** 2) > dzRadius) continue
          }
          const d = distance({ x: nx, y: ny }, agent.position)
          const amount = grid[ny][nx].resourceAmount ?? 1
          // Low intellect: pure proximity. High intellect: value per step.
          const score = (1 - agent.traits.intellect) * (1 / (d + 1))
                      + agent.traits.intellect * (amount / (d + 1))
          if (score > bestScore) {
            bestScore = score
            nearestResource = { x: nx, y: ny }
          }
        }
      }
    }
  }
  // High-memory agents can recall last known resource position when nothing is visible.
  // Don't chase a remembered resource that's now inside the death zone (unless dashing).
  if (!nearestResource && agent.lastKnownResourcePos && agent.traits.memory > 0.5) {
    const mem = agent.lastKnownResourcePos
    const memInZone = dzRadius !== Infinity && (() => {
      const cx = (width - 1) / 2
      const cy = (height - 1) / 2
      return Math.sqrt((mem.x - cx) ** 2 + (mem.y - cy) ** 2) > dzRadius
    })()
    if (!memInZone || greedyDash) nearestResource = mem
  }
  if (nearestResource) {
    return candidates.sort((a, b) => distance(a, nearestResource!) - distance(b, nearestResource!))[0]
  }

  // No resources visible: aggressive agents or near-winners chase enemies
  const enemies = liveOthers.filter(a => !agent.relations[a.id]?.allied)
  if (enemies.length > 0 && (agent.traits.aggression > 0.55 || resourceProgress > 0.5)) {
    const target = resourceProgress > 0.5
      ? enemies.sort((a, b) => b.resources - a.resources)[0]
      : enemies.sort((a, b) => distance(a.position, agent.position) - distance(b.position, agent.position))[0]
    return candidates.sort((a, b) => distance(a, target.position) - distance(b, target.position))[0]
  }

  // When the death zone is active, prefer cells inside the safe radius over stepping into danger
  if (dzRadius !== Infinity) {
    const cx = (width - 1) / 2
    const cy = (height - 1) / 2
    const safeCandidates = candidates.filter(
      p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2) <= dzRadius
    )
    return shuffle(safeCandidates.length > 0 ? safeCandidates : candidates)[0]
  }

  return shuffle(candidates)[0]
}

export function updateRelations(agent: AgentState): void {
  // High memory = slow decay: agents hold grudges and trust longer.
  // Low memory = fast decay: agents forgive (or forget resentment) quickly.
  const memoryDecay = 1 - (1 - agent.traits.memory) * 0.015
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

// All agents share the same trait point total so no agent starts with an inherent stat advantage.
const TRAIT_TOTAL = 3.5

export function randomizeTraits(base: Partial<AgentTraits> = {}): AgentTraits {
  const raw = {
    aggression:    base.aggression    ?? randomFloat(0, 1),
    trust:         base.trust         ?? randomFloat(0, 1),
    loyalty:       base.loyalty       ?? randomFloat(0, 1),
    greed:         base.greed         ?? randomFloat(0, 1),
    riskTolerance: base.riskTolerance ?? randomFloat(0, 1),
    memory:        base.memory        ?? randomFloat(0, 1),
    irrationality: base.irrationality ?? randomFloat(0, 0.35),
    intellect:     base.intellect     ?? randomFloat(0, 1),
  }

  const sum = Object.values(raw).reduce((a, b) => a + b, 0)
  const scale = TRAIT_TOTAL / sum

  return {
    aggression:    clamp(raw.aggression    * scale, 0, 1),
    trust:         clamp(raw.trust         * scale, 0, 1),
    loyalty:       clamp(raw.loyalty       * scale, 0, 1),
    greed:         clamp(raw.greed         * scale, 0, 1),
    riskTolerance: clamp(raw.riskTolerance * scale, 0, 1),
    memory:        clamp(raw.memory        * scale, 0, 1),
    irrationality: clamp(raw.irrationality * scale, 0, 1),
    intellect:     clamp(raw.intellect     * scale, 0, 1),
  }
}
