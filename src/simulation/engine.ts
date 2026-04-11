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
import { AGENT_PRESETS } from './presets'
import {
  agentColor,
  clamp,
  distance,
  generateAgentName,
  randomFloat,
  shuffle,
  getSafeRadius,
  DEATH_ZONE_DAMAGE,
} from './utils'

// Per-cell per-tick probability. 600 cells × 0.000018 ≈ 1 new resource every ~93 ticks.
const RESOURCE_SPAWN_RATE = 0.000018

// If all survivors are allied for this many ticks straight, they win together
const STANDOFF_TIMEOUT = 60

// An agent wins immediately upon reaching this many resources
const RESOURCE_WIN_THRESHOLD = 100

export function createSimulation(config: SimulationConfig): SimulationState {
  const grid = createGrid(config.world)
  const agents: AgentState[] = []
  const positions = shuffle(findEmptyPositions(grid, []))

  if (config.usePresetAgents) {
    const activePresets = config.selectedPresets && config.selectedPresets.length >= 2
      ? AGENT_PRESETS.filter(p => config.selectedPresets!.includes(p.name))
      : AGENT_PRESETS
    for (let i = 0; i < activePresets.length; i++) {
      const preset = activePresets[i]
      const pos = positions[i] ?? { x: 0, y: 0 }
      agents.push(createAgent(`agent-${i}`, preset.name, pos, agentColor(i), preset.traits))
    }
  } else {
    for (let i = 0; i < config.world.agentCount; i++) {
      const pos = positions[i] ?? { x: 0, y: 0 }
      const traits = randomizeTraits(config.world.defaultTraits)
      agents.push(createAgent(`agent-${i}`, generateAgentName(i), pos, agentColor(i), traits))
    }
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
    draw: false,
  }
}

export function stepSimulation(state: SimulationState): SimulationState {
  const { agents, grid, tick } = state

  // Don't step if already over
  if (state.winners.length > 0 || state.draw) return state

  const newGrid = grid.map(row => row.map(cell => ({ ...cell })))
  const newAgents = agents.map(a => ({
    ...a,
    relations: Object.fromEntries(
      Object.entries(a.relations).map(([k, v]) => [k, { ...v }])
    ),
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

    // Memory scan: update agent's last known resource position after acting
    if (agent.alive) {
      const scanRadius = Math.max(2, Math.round(agent.traits.memory * 12))
      let bestDist = Infinity
      for (let dy = -scanRadius; dy <= scanRadius; dy++) {
        for (let dx = -scanRadius; dx <= scanRadius; dx++) {
          const nx = agent.position.x + dx
          const ny = agent.position.y + dy
          if (newGrid[ny]?.[nx]?.type === 'resource') {
            const d = Math.abs(dx) + Math.abs(dy)
            if (d < bestDist) { bestDist = d; agent.lastKnownResourcePos = { x: nx, y: ny } }
          }
        }
      }
      // Forget if standing on the remembered spot and it's gone
      const mem = agent.lastKnownResourcePos
      if (mem && agent.position.x === mem.x && agent.position.y === mem.y
          && newGrid[mem.y]?.[mem.x]?.type !== 'resource') {
        agent.lastKnownResourcePos = undefined
      }
    }
  }

  const maxResources = Math.max(8, state.config.world.agentCount * 2)
  spawnResources(newGrid, RESOURCE_SPAWN_RATE, maxResources)

  // Death zone: shrinking circle that damages agents outside the safe radius
  const dzCols = newGrid[0].length
  const dzRows = newGrid.length
  const safeRadius = getSafeRadius(tick, dzCols, dzRows)
  if (safeRadius !== Infinity) {
    const cx = (dzCols - 1) / 2
    const cy = (dzRows - 1) / 2
    for (const agent of newAgents.filter(a => a.alive)) {
      const dx = agent.position.x - cx
      const dy = agent.position.y - cy
      if (Math.sqrt(dx * dx + dy * dy) > safeRadius) {
        agent.health -= DEATH_ZONE_DAMAGE
        if (newEvents[newEvents.length - 1]?.agentId !== agent.id ||
            newEvents[newEvents.length - 1]?.action !== 'idle') {
          newEvents.push({
            tick: tick + 1,
            agentId: agent.id,
            agentName: agent.name,
            action: 'idle',
            description: `${agent.name} is burning in the death zone!`,
          })
        }
      }
    }
  }

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
  let draw = false
  let newStandoffSince = state.standoffSince

  // Resource win: any agent that crossed the threshold this tick
  const resourceWinners = stillAlive.filter(a => a.resources >= RESOURCE_WIN_THRESHOLD)

  if (resourceWinners.length > 0) {
    // If multiple crossed the threshold simultaneously, all win together
    winners = resourceWinners
  } else if (stillAlive.length === 0) {
    // Everyone died simultaneously — draw
    draw = true
  } else if (stillAlive.length === 1 && prevAlive.length > 1) {
    // Solo survival win
    winners = [stillAlive[0]]
  } else if (stillAlive.length >= 2) {
    // Use BFS connected components: all survivors are in one alliance group if
    // every agent is reachable from the first via pairwise allied links.
    const agentByIdForStandoff = new Map(stillAlive.map(a => [a.id, a]))
    const allianceGroup = allianceGroupOf(stillAlive[0].id, agentByIdForStandoff)
    const allMutuallyAllied = allianceGroup.length === stillAlive.length

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

  const isOver = winners.length > 0 || draw
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
    draw,
  }
}

// BFS over pairwise allied relations to find all members of an agent's alliance group
function allianceGroupOf(agentId: string, agentById: Map<string, AgentState>): AgentState[] {
  const visited = new Set<string>()
  const queue = [agentId]
  const group: AgentState[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const a = agentById.get(id)
    if (!a?.alive) continue
    group.push(a)
    for (const [targetId, rel] of Object.entries(a.relations)) {
      if (rel.allied && !visited.has(targetId)) queue.push(targetId)
    }
  }
  return group
}

function distributeResources(
  agent: AgentState,
  amount: number,
  agentById: Map<string, AgentState>,
  log: (action: AgentAction['type'], description: string, targetId?: string) => void
): void {
  const allies = Array.from(agentById.values()).filter(
    a => a.alive && a.id !== agent.id && agent.relations[a.id]?.allied
  )
  const members = [agent, ...allies]
  const share = Math.floor(amount / members.length)
  const remainder = amount - share * members.length
  agent.resources += share + remainder
  for (const ally of allies) {
    ally.resources += share
  }
  if (allies.length > 0) {
    log('gather', `${agent.name} gathered ${amount} resources, shared ${share} each with ${allies.map(a => a.name).join(', ')}`)
  } else {
    log('gather', `${agent.name} gathered ${amount} resources`)
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
        // Keep up to 3 recent positions to detect oscillation cycles
        agent.positionHistory = [{ ...agent.position }, ...agent.positionHistory].slice(0, 3)
        agent.prevPosition = { ...agent.position }
        agent.position = action.targetPos
        posMap.set(key, agent.id)
        // Auto-collect resource on landing
        if (destCell?.type === 'resource' && (destCell.resourceAmount ?? 0) > 0) {
          const amount = destCell.resourceAmount ?? 0
          destCell.type = 'empty'
          delete destCell.resourceAmount
          distributeResources(agent, amount, agentById, log)
        }
      }
      break
    }

    case 'gather': {
      const pos = action.targetPos ?? agent.position
      const cell = cellAt(grid, pos)
      if (cell?.type === 'resource' && (cell.resourceAmount ?? 0) > 0) {
        const amount = cell.resourceAmount ?? 0
        cell.type = 'empty'
        delete cell.resourceAmount
        distributeResources(agent, amount, agentById, log)
      }
      break
    }

    case 'attack': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break
      if (distance(agent.position, target.position) > 1) break
      // Hard guard: never allow attacking a current ally — use betray-ally for that
      if (agent.relations[target.id]?.allied) break

      // Base damage
      let attackPower = 10 + randomFloat(0, 10) * (0.5 + agent.traits.aggression * 0.5)
      const defense = 1

      // Alliance combat bonus: each allied agent adjacent to the target adds +50% damage
      const allLive = Array.from(agentById.values()).filter(a => a.alive)
      const supportingAllies = allLive.filter(
        a => a.id !== agent.id && agent.relations[a.id]?.allied && distance(a.position, target.position) <= 1
      )
      if (supportingAllies.length > 0) {
        attackPower *= 1 + supportingAllies.length * 0.5
        log('support-ally', `${supportingAllies.map(a => a.name).join(', ')} supported ${agent.name}'s attack`)
      }

      const damage = Math.round(attackPower * defense)
      target.health = clamp(target.health - damage, 0, 100)
      modifyResentment(target, agent.id, 0.25)
      modifyTrust(target, agent.id, -0.3)

      log('attack', `${agent.name} attacked ${target.name} for ${damage} damage`, target.id)

      if (target.health <= 0) {
        const totalLoot = Math.floor(target.resources * 0.5)
        // Split loot evenly among attacker and all alive allies
        const allianceMembers = [agent, ...allLive.filter(
          a => a.id !== agent.id && agent.relations[a.id]?.allied
        )]
        const share = Math.floor(totalLoot / allianceMembers.length)
        for (const member of allianceMembers) {
          member.resources += share
        }
        const allianceDesc = allianceMembers.length > 1
          ? ` (split ${share} each with ${allianceMembers.slice(1).map(a => a.name).join(', ')})`
          : ''
        log('attack', `${agent.name} defeated ${target.name}, looting ${totalLoot} resources${allianceDesc}`, target.id)
      }
      break
    }

    case 'heal': {
      const cost = 20
      const amount = 30
      if (agent.resources >= cost && agent.health < 100) {
        agent.resources -= cost
        agent.health = clamp(agent.health + amount, 0, 100)
        log('heal', `${agent.name} spent ${cost} resources to heal ${amount} HP`)
      }
      break
    }

    case 'offer-alliance': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break

      const agentRel = getOrInitRelation(agent, action.targetId)
      agentRel.lastOfferTick = tick

      const targetRel = getOrInitRelation(target, agent.id)
      // Acceptance is purely gullibility-driven — low-trust agents almost always refuse
      const acceptChance = target.traits.trust * 0.85 + Math.max(0, targetRel.trust) * 0.2

      if (randomFloat() < acceptChance) {
        // Find everyone already in the target's alliance group
        const targetGroup = allianceGroupOf(target.id, agentById)
        // Connect agent to every member of the group (and vice versa)
        for (const member of targetGroup) {
          if (member.id === agent.id) continue
          const r1 = getOrInitRelation(agent, member.id)
          r1.allied = true
          r1.allianceTick = tick
          const r2 = getOrInitRelation(member, agent.id)
          r2.allied = true
          r2.allianceTick = tick
          modifyTrust(agent, member.id, 0.25)
          modifyTrust(member, agent.id, 0.25)
        }
        const groupNames = targetGroup.filter(m => m.id !== agent.id).map(m => m.name).join(', ')
        log('accept-alliance', `${target.name} accepted ${agent.name}'s alliance offer${targetGroup.length > 1 ? ` — ${agent.name} joins group: ${groupNames}` : ''}`, target.id)
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

      // Break all of the agent's alliances — leaving the entire group
      const formerGroup = allianceGroupOf(agent.id, agentById).filter(m => m.id !== agent.id)
      for (const member of formerGroup) {
        getOrInitRelation(agent, member.id).allied = false
        getOrInitRelation(member, agent.id).allied = false
        modifyResentment(member, agent.id, 0.9)
        modifyTrust(member, agent.id, -0.9)
      }

      const stolen = Math.floor(target.resources * 0.35)
      agent.resources += stolen
      target.resources = Math.max(0, target.resources - stolen)

      // Reputation damage — all other agents trust the betrayer less
      for (const other of agentById.values()) {
        if (other.id !== agent.id && other.alive) {
          modifyTrust(other, agent.id, -0.15)
        }
      }

      const groupDesc = formerGroup.length > 1
        ? ` (abandoned ${formerGroup.map(m => m.name).join(', ')})`
        : ''
      log('betray-ally', `${agent.name} betrayed ${target.name}, stealing ${stolen} resources!${groupDesc}`, target.id)
      break
    }

    case 'share': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break
      const amount = Math.min(Math.floor(agent.resources * 0.3), 35)
      if (amount <= 0) break
      agent.resources -= amount
      target.resources += amount
      modifyTrust(target, agent.id, 0.25)
      modifyTrust(agent, target.id, 0.1)
      log('share', `${agent.name} shared ${amount} resources with ${target.name}`, target.id)
      break
    }

    case 'support-ally': {
      if (!action.targetId) break
      const target = agentById.get(action.targetId)
      if (!target || !target.alive) break
      modifyTrust(agent, target.id, 0.08)
      modifyTrust(target, agent.id, 0.08)
      log('support-ally', `${agent.name} is standing by ${target.name}`, target.id)
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

export function getAllianceGroups(agents: AgentState[]): Array<{ members: AgentState[]; since: number }> {
  const visited = new Set<string>()
  const groups: Array<{ members: AgentState[]; since: number }> = []
  const agentById = new Map(agents.map(a => [a.id, a]))

  for (const agent of agents) {
    if (!agent.alive || visited.has(agent.id)) continue
    const hasAlliance = Object.values(agent.relations).some(r => r.allied)
    if (!hasAlliance) continue

    const members: AgentState[] = []
    let since = Infinity
    const queue = [agent.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const a = agentById.get(id)
      if (!a?.alive) continue
      members.push(a)
      for (const [targetId, rel] of Object.entries(a.relations)) {
        if (rel.allied && !visited.has(targetId)) {
          since = Math.min(since, rel.allianceTick)
          queue.push(targetId)
        }
      }
    }
    if (members.length >= 2) {
      groups.push({ members, since: since === Infinity ? 0 : since })
    }
  }

  return groups.sort((a, b) => a.since - b.since)
}

function generateStory(
  events: EventLogEntry[],
  agents: AgentState[],
  totalTicks: number,
  winners: AgentState[]
): string[] {
  const lines: string[] = []

  if (winners.length === 0) {
    lines.push('All agents eliminated each other simultaneously. No winner.')
  } else if (winners.length === 1) {
    const w = winners[0]
    if (w.resources >= RESOURCE_WIN_THRESHOLD) {
      lines.push(`${w.name} won by accumulating ${w.resources} resources.`)
    } else {
      lines.push(`${w.name} was the last agent standing.`)
    }
  } else {
    const names = winners.map(w => w.name).join(' and ')
    if (winners.every(w => w.resources >= RESOURCE_WIN_THRESHOLD)) {
      lines.push(`${names} both reached the resource threshold simultaneously.`)
    } else {
      lines.push(`${names} formed an unbreakable alliance and won together.`)
    }
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
