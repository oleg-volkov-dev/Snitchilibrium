import {
  AgentAction,
  AgentState,
  Cell,
  EventLogEntry,
  SimulationConfig,
  SimulationState,
} from './types'
import {
  createAgent,
  decideAction,
  getOrInitRelation,
  modifyResentment,
  modifyTrust,
  randomizeTraits,
  updateRelations,
} from './agent'
import { cellAt, createGrid, findEmptyPositions, spawnResources } from './world'
import {
  agentColor,
  clamp,
  distance,
  generateAgentName,
  randomFloat,
  shuffle,
} from './utils'

// Per-cell per-tick probability. 600 cells × 0.00004 ≈ 1 new resource every 40 ticks.
const RESOURCE_SPAWN_RATE = 0.00004

// If all survivors are allied for this many ticks straight, they win together
const STANDOFF_TIMEOUT = 120

export function createSimulation(config: SimulationConfig): SimulationState {
  const grid = createGrid(config.world)
  const agents: AgentState[] = []
  const positions = shuffle(findEmptyPositions(grid, []))

  for (let i = 0; i < config.world.agentCount; i++) {
    const pos = positions[i] ?? { x: 0, y: 0 }
    const traits = randomizeTraits(config.world.defaultTraits)
    const agent = createAgent(`agent-${i}`, generateAgentName(i), pos, agentColor(i), traits)
    agents.push(agent)
  }

  return {
    tick: 0,
    running: false,
    agents,
    grid,
    events: [],
    config,
    winners: [],
    story: [],
    standoffSince: 0,
  }
}

export function stepSimulation(state: SimulationState): SimulationState {
  const { agents, grid, tick } = state

  // Don't step if already over
  if (state.winners.length > 0) return state

  const newGrid = grid.map(row => row.map(cell => ({ ...cell })))
  const newAgents = agents.map(a => ({
    ...a,
    relations: Object.fromEntries(
      Object.entries(a.relations).map(([k, v]) => [k, { ...v }])
    ),
    defending: false,
  }))
  const newEvents: EventLogEntry[] = []

  const liveAgents = newAgents.filter(a => a.alive)

  const posMap = new Map<string, string>()
  for (const a of liveAgents) {
    posMap.set(`${a.position.x},${a.position.y}`, a.id)
  }

  const agentById = new Map(newAgents.map(a => [a.id, a]))

  // Compute standoff pressure for this tick
  const standoffPressure = state.standoffSince > 0
    ? clamp((tick - state.standoffSince) / STANDOFF_TIMEOUT, 0, 1)
    : 0

  for (const agent of shuffle(liveAgents)) {
    if (!agent.alive) continue
    updateRelations(agent)
    const action = decideAction(agent, liveAgents, newGrid, tick, standoffPressure)
    applyAction(agent, action, agentById, newGrid, posMap, tick, newEvents)
  }

  const maxResources = Math.max(8, state.config.world.agentCount * 2)
  spawnResources(newGrid, RESOURCE_SPAWN_RATE, maxResources)

  for (const a of newAgents) {
    if (a.health <= 0) {
      a.alive = false
      posMap.delete(`${a.position.x},${a.position.y}`)
    }
  }

  const MAX_EVENTS = 300
  const allEvents = [...state.events, ...newEvents].slice(-MAX_EVENTS)

  const stillAlive = newAgents.filter(a => a.alive)
  const prevAlive = agents.filter(a => a.alive)

  // Check win conditions
  let winners: AgentState[] = []
  let newStandoffSince = state.standoffSince

  if (stillAlive.length === 1 && prevAlive.length > 1) {
    // Solo win
    winners = [stillAlive[0]]
  } else if (stillAlive.length === 0) {
    // Everyone died simultaneously — no winner
    winners = []
  } else if (stillAlive.length >= 2) {
    const allMutuallyAllied = stillAlive.every(a =>
      stillAlive.filter(b => b.id !== a.id).every(b => a.relations[b.id]?.allied)
    )

    if (allMutuallyAllied) {
      if (state.standoffSince === 0) {
        newStandoffSince = tick
      } else if (tick - state.standoffSince >= STANDOFF_TIMEOUT) {
        // Alliance wins together
        winners = stillAlive
      }
    } else {
      newStandoffSince = 0
    }
  }

  const isOver = winners.length > 0
  const story = isOver
    ? generateStory(allEvents, newAgents, tick + 1, winners)
    : state.story

  return {
    ...state,
    tick: tick + 1,
    running: isOver ? false : state.running,
    agents: newAgents,
    grid: newGrid,
    events: allEvents,
    winners,
    story,
    standoffSince: newStandoffSince,
  }
}

function applyAction(
  agent: AgentState,
  action: AgentAction,
  agentById: Map<string, AgentState>,
  grid: Cell[][],
  posMap: Map<string, string>,
  tick: number,
  events: EventLogEntry[]
): void {
  const log = (
    actionType: AgentAction['type'],
    description: string,
    targetId?: string
  ) => {
    const target = targetId ? agentById.get(targetId) : undefined
    events.push({
      tick,
      agentId: agent.id,
      agentName: agent.name,
      action: actionType,
      targetId,
      targetName: target?.name,
      description,
    })
  }

  switch (action.type) {
    case 'move': {
      if (!action.targetPos) break
      const key = `${action.targetPos.x},${action.targetPos.y}`
      const destCell = grid[action.targetPos.y]?.[action.targetPos.x]
      if (!posMap.has(key) && destCell?.type !== 'obstacle') {
        posMap.delete(`${agent.position.x},${agent.position.y}`)
        agent.prevPosition = { ...agent.position }
        agent.position = action.targetPos
        posMap.set(key, agent.id)
        // Auto-collect resource on landing
        if (destCell?.type === 'resource' && (destCell.resourceAmount ?? 0) > 0) {
          const amount = destCell.resourceAmount ?? 0
          agent.resources += amount
          destCell.type = 'empty'
          delete destCell.resourceAmount
          log('gather', `${agent.name} picked up ${amount} resources`, undefined)
        }
      }
      break
    }

    case 'gather': {
      const pos = action.targetPos ?? agent.position
      const cell = cellAt(grid, pos)
      if (cell?.type === 'resource' && (cell.resourceAmount ?? 0) > 0) {
        const amount = cell.resourceAmount ?? 0
        agent.resources += amount
        cell.type = 'empty'
        delete cell.resourceAmount
        log('gather', `${agent.name} gathered ${amount} resources`)
      }
      break
    }

    case 'attack': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break
      if (distance(agent.position, target.position) > 1) break

      // Base damage
      let attackPower = 10 + randomFloat(0, 10) * (0.5 + agent.traits.aggression * 0.5)
      const defense = target.defending ? 0.5 : 1

      // Alliance combat bonus: each allied agent adjacent to the target adds +25% damage
      const allLive = Array.from(agentById.values()).filter(a => a.alive)
      const supportingAllies = allLive.filter(
        a => a.id !== agent.id && agent.relations[a.id]?.allied && distance(a.position, target.position) <= 1
      )
      if (supportingAllies.length > 0) {
        attackPower *= 1 + supportingAllies.length * 0.25
        log('support-ally', `${supportingAllies.map(a => a.name).join(', ')} supported ${agent.name}'s attack`)
      }

      const damage = Math.round(attackPower * defense)
      target.health = clamp(target.health - damage, 0, 100)
      modifyResentment(target, agent.id, 0.25)
      modifyTrust(target, agent.id, -0.3)

      // Break alliance if one existed
      const rel = getOrInitRelation(target, agent.id)
      if (rel.allied) {
        rel.allied = false
        getOrInitRelation(agent, target.id).allied = false
        modifyResentment(target, agent.id, 0.5)
        log('betray-ally', `${agent.name} attacked ally ${target.name}!`, target.id)
      } else {
        log('attack', `${agent.name} attacked ${target.name} for ${damage} damage`, target.id)
      }

      if (target.health <= 0) {
        const stolen = Math.floor(target.resources * 0.5)
        agent.resources += stolen
        log('attack', `${agent.name} defeated ${target.name}, looting ${stolen} resources`, target.id)
      }
      break
    }

    case 'defend': {
      agent.defending = true
      break
    }

    case 'offer-alliance': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break

      const agentRel = getOrInitRelation(agent, action.targetId)
      agentRel.lastOfferTick = tick

      const targetRel = getOrInitRelation(target, agent.id)
      const acceptChance = 0.25 + target.traits.trust * 0.6 + Math.max(0, targetRel.trust) * 0.25

      if (randomFloat() < acceptChance) {
        agentRel.allied = true
        agentRel.allianceTick = tick
        targetRel.allied = true
        targetRel.allianceTick = tick
        modifyTrust(agent, target.id, 0.25)
        modifyTrust(target, agent.id, 0.25)
        log('accept-alliance', `${target.name} accepted ${agent.name}'s alliance offer`, target.id)
      } else {
        modifyTrust(agent, target.id, -0.05)
        log('reject-alliance', `${target.name} rejected ${agent.name}'s alliance offer`, target.id)
      }
      break
    }

    case 'betray-ally': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break

      getOrInitRelation(agent, target.id).allied = false
      getOrInitRelation(target, agent.id).allied = false

      const stolen = Math.floor(target.resources * 0.35)
      agent.resources += stolen
      target.resources = Math.max(0, target.resources - stolen)

      modifyResentment(target, agent.id, 0.9)
      modifyTrust(target, agent.id, -0.9)

      // Reputation damage — others trust the betrayer less
      for (const other of agentById.values()) {
        if (other.id !== agent.id && other.id !== target.id && other.alive) {
          modifyTrust(other, agent.id, -0.15)
        }
      }

      log('betray-ally', `${agent.name} betrayed ${target.name}, stealing ${stolen} resources!`, target.id)
      break
    }

    case 'support-ally': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break
      modifyTrust(agent, target.id, 0.1)
      modifyTrust(target, agent.id, 0.1)
      break
    }

    default:
      break
  }
}

export function getLeaderboard(agents: AgentState[]): AgentState[] {
  return [...agents]
    .filter(a => a.alive)
    .sort((a, b) => b.resources - a.resources)
}

export function getActiveAlliances(agents: AgentState[]): Array<{ a: AgentState; b: AgentState; since: number }> {
  const pairs: Array<{ a: AgentState; b: AgentState; since: number }> = []
  const seen = new Set<string>()
  for (const agent of agents) {
    if (!agent.alive) continue
    for (const [targetId, rel] of Object.entries(agent.relations)) {
      if (!rel.allied) continue
      const key = [agent.id, targetId].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const target = agents.find(a => a.id === targetId)
      if (target?.alive) {
        pairs.push({ a: agent, b: target, since: rel.allianceTick })
      }
    }
  }
  return pairs.sort((x, y) => x.since - y.since)
}

function generateStory(
  events: EventLogEntry[],
  agents: AgentState[],
  totalTicks: number,
  winners: AgentState[]
): string[] {
  const lines: string[] = []

  if (winners.length === 1) {
    lines.push(`${winners[0].name} was the last agent standing.`)
  } else {
    const names = winners.map(w => w.name).join(' and ')
    lines.push(`${names} formed an unbreakable alliance and won together.`)
  }

  const firstKill = events.find(e => e.action === 'attack' && e.description.includes('defeated'))
  if (firstKill) {
    lines.push(`First blood at tick ${firstKill.tick}: ${firstKill.description}`)
  }

  const killCounts: Record<string, number> = {}
  for (const e of events) {
    if (e.action === 'attack' && e.description.includes('defeated')) {
      killCounts[e.agentId] = (killCounts[e.agentId] ?? 0) + 1
    }
  }
  const topKiller = Object.entries(killCounts).sort((a, b) => b[1] - a[1])[0]
  if (topKiller) {
    const name = agents.find(a => a.id === topKiller[0])?.name ?? topKiller[0]
    lines.push(`${name} was the most ruthless with ${topKiller[1]} kills.`)
  }

  const betrayalCounts: Record<string, number> = {}
  for (const e of events) {
    if (e.action === 'betray-ally') {
      betrayalCounts[e.agentId] = (betrayalCounts[e.agentId] ?? 0) + 1
    }
  }
  const topBetrayer = Object.entries(betrayalCounts).sort((a, b) => b[1] - a[1])[0]
  if (topBetrayer && topBetrayer[1] > 0) {
    const name = agents.find(a => a.id === topBetrayer[0])?.name ?? topBetrayer[0]
    lines.push(`${name} betrayed ${topBetrayer[1]} ${topBetrayer[1] === 1 ? 'ally' : 'allies'}.`)
  }

  const topGatherer = [...agents].sort((a, b) => b.resources - a.resources)[0]
  if (topGatherer) {
    lines.push(`${topGatherer.name} ended with ${topGatherer.resources} resources.`)
  }

  lines.push(`Simulation lasted ${totalTicks} ticks.`)
  return lines
}
