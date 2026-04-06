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

const RESOURCE_SPAWN_RATE = 0.001

export function createSimulation(config: SimulationConfig): SimulationState {
  const grid = createGrid(config.world)
  const agents: AgentState[] = []
  const positions = shuffle(findEmptyPositions(grid, []))

  for (let i = 0; i < config.world.agentCount; i++) {
    const pos = positions[i] ?? { x: 0, y: 0 }
    const traits = randomizeTraits(config.world.defaultTraits)
    const agent = createAgent(
      `agent-${i}`,
      generateAgentName(i),
      pos,
      agentColor(i),
      traits
    )
    agents.push(agent)
  }

  return {
    tick: 0,
    running: false,
    agents,
    grid,
    events: [],
    config,
  }
}

export function stepSimulation(state: SimulationState): SimulationState {
  const { agents, grid, tick, config } = state
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

  // Build position map for collision detection
  const posMap = new Map<string, string>()
  for (const a of liveAgents) {
    posMap.set(`${a.position.x},${a.position.y}`, a.id)
  }

  const agentById = new Map(newAgents.map(a => [a.id, a]))

  for (const agent of shuffle(liveAgents)) {
    if (!agent.alive) continue

    updateRelations(agent, tick)

    const action = decideAction(agent, liveAgents, newGrid, tick)
    applyAction(agent, action, agentById, newGrid, posMap, tick, newEvents)
  }

  // Respawn resources slowly
  spawnResources(newGrid, RESOURCE_SPAWN_RATE)

  // Kill agents with 0 health
  for (const a of newAgents) {
    if (a.health <= 0) {
      a.alive = false
      posMap.delete(`${a.position.x},${a.position.y}`)
    }
  }

  const MAX_EVENTS = 200
  const allEvents = [...state.events, ...newEvents].slice(-MAX_EVENTS)

  return {
    ...state,
    tick: tick + 1,
    agents: newAgents,
    grid: newGrid,
    events: allEvents,
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
      if (!posMap.has(key) && grid[action.targetPos.y]?.[action.targetPos.x]?.type !== 'obstacle') {
        posMap.delete(`${agent.position.x},${agent.position.y}`)
        agent.position = action.targetPos
        posMap.set(key, agent.id)
      }
      break
    }

    case 'gather': {
      const pos = action.targetPos ?? agent.position
      const cell = cellAt(grid, pos)
      if (cell?.type === 'resource' && (cell.resourceAmount ?? 0) > 0) {
        const amount = Math.min(cell.resourceAmount ?? 0, 10)
        cell.resourceAmount = (cell.resourceAmount ?? 0) - amount
        if ((cell.resourceAmount ?? 0) <= 0) {
          cell.type = 'empty'
          delete cell.resourceAmount
        }
        agent.resources += amount
        log('gather', `${agent.name} gathered ${amount} resources`)
      }
      break
    }

    case 'attack': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break
      if (distance(agent.position, target.position) > 1) break

      const attackPower = 15 + randomFloat(-5, 10) * agent.traits.aggression
      const defense = target.defending ? 0.5 : 1
      const damage = Math.round(attackPower * defense)

      target.health = clamp(target.health - damage, 0, 100)
      modifyResentment(target, agent.id, 0.3)
      modifyTrust(target, agent.id, -0.4)
      modifyResentment(agent, target.id, -0.1)

      // Break alliance if one existed
      const rel = getOrInitRelation(target, agent.id)
      if (rel.allied) {
        rel.allied = false
        const agentRel = getOrInitRelation(agent, target.id)
        agentRel.allied = false
        modifyResentment(target, agent.id, 0.4)
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

      const targetRel = getOrInitRelation(target, agent.id)
      const acceptChance = target.traits.trust + targetRel.trust * 0.3

      if (randomFloat() < acceptChance) {
        const agentRel = getOrInitRelation(agent, target.id)
        agentRel.allied = true
        agentRel.allianceTick = tick
        targetRel.allied = true
        targetRel.allianceTick = tick
        modifyTrust(agent, target.id, 0.3)
        modifyTrust(target, agent.id, 0.3)
        log('accept-alliance', `${target.name} accepted ${agent.name}'s alliance offer`, target.id)
      } else {
        modifyTrust(agent, target.id, -0.1)
        log('reject-alliance', `${target.name} rejected ${agent.name}'s alliance offer`, target.id)
      }
      break
    }

    case 'betray-ally': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break

      const agentRel = getOrInitRelation(agent, target.id)
      const targetRel = getOrInitRelation(target, agent.id)

      agentRel.allied = false
      targetRel.allied = false

      const stolen = Math.floor(target.resources * 0.3)
      agent.resources += stolen
      target.resources -= stolen

      modifyResentment(target, agent.id, 0.8)
      modifyTrust(target, agent.id, -0.8)
      modifyResentment(agent, target.id, 0.1)

      // Spread reputation damage
      for (const other of agentById.values()) {
        if (other.id !== agent.id && other.id !== target.id && other.alive) {
          modifyTrust(other, agent.id, -0.1)
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
