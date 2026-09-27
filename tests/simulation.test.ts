import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgent, decideAction, getOrInitRelation, randomizeTraits } from '../src/simulation/agent'
import { createSimulation, stepSimulation } from '../src/simulation/engine'
import { AGENT_PRESETS } from '../src/simulation/presets'
import { normalizeTraits } from '../src/simulation/traits'
import { AgentTraits, SimulationConfig } from '../src/simulation/types'
import { useSimulationStore } from '../src/store/simulationStore'
import { HIDE_DURATION, isHidden } from '../src/simulation/concealment'
import { createGrid, isPassable, spawnResources } from '../src/simulation/world'
import { DEATH_ZONE_START, getSafeRadius } from '../src/simulation/utils'

const config: SimulationConfig = {
  world: { width: 10, height: 10, agentCount: 2, resourceDensity: 0, obstacleDensity: 0, grassDensity: 0, defaultTraits: {}, deathZoneStart: 800 },
  tickIntervalMs: 300, maxTicks: 5000, usePresetAgents: false,
}
const zero: AgentTraits = { aggression: 0, trust: 0, loyalty: 0, greed: 0, riskTolerance: 0, memory: 0, irrationality: 0, intellect: 0 }
function fixedRandom(value: number, fn: () => void) {
  const original = Math.random
  Math.random = () => value
  try { fn() } finally { Math.random = original }
}
function assertBudget(traits: AgentTraits) {
  const values = Object.values(traits)
  assert.ok(values.every(value => Number.isFinite(value) && value >= 0 && value <= 1))
  assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 3.5) < 1e-10)
}

test('the death zone defaults to tick 800', () => {
  assert.equal(DEATH_ZONE_START, 800)
  assert.equal(useSimulationStore.getState().config.world.deathZoneStart, 800)
  assert.equal(getSafeRadius(799, 40, 30), Infinity)
  assert.ok(Number.isFinite(getSafeRadius(800, 40, 30)))
})

test('grass is passable cover and resource spawning preserves it', () => {
  fixedRandom(.05, () => {
    const grid = createGrid({ ...config.world, grassDensity: .1 })
    assert.ok(grid.flat().every(cell => cell.type === 'grass'))
    assert.equal(isPassable(grid, { x: 0, y: 0 }), true)
    spawnResources(grid, 1)
    assert.ok(grid.flat().every(cell => cell.type === 'grass'))
  })
})

test('a wounded agent enters reachable grass and immediately escapes targeting', () => {
  const state = createSimulation(config)
  const runner = createAgent('r', 'Runner', { x: 2, y: 2 }, '#fff', zero)
  const hunter = createAgent('h', 'Hunter', { x: 3, y: 2 }, '#fff', { ...zero, aggression: 1, riskTolerance: 1 })
  runner.health = 25
  state.agents = [runner, hunter]
  state.grid[1][2] = { type: 'grass' }
  const before = JSON.stringify(state)
  fixedRandom(.99, () => {
    const next = stepSimulation(state)
    assert.deepEqual(next.agents[0].position, { x: 2, y: 1 })
    assert.equal(next.agents[0].health, 25)
    assert.equal(next.agents[0].hiddenUntil, next.tick + HIDE_DURATION)
    assert.equal(isHidden(next.agents[0], next.grid, next.tick), true)
    assert.ok(next.events.some(event => event.action === 'hide'))
    assert.ok(next.events.every(event => event.action !== 'attack'))
    assert.equal(JSON.stringify(state), before)
  })
})

test('concealment protects for exactly 30 ticks then expires even without leaving grass', () => {
  let state = createSimulation(config)
  const hunter = createAgent('h', 'Hunter', { x: 2, y: 2 }, '#fff', { ...zero, aggression: 1, riskTolerance: 1 })
  const runner = createAgent('r', 'Runner', { x: 3, y: 2 }, '#fff', zero)
  runner.health = 70
  runner.hiddenUntil = 31
  runner.hideAvailableAt = 61
  state.agents = [hunter, runner]
  state.grid = state.grid.map(row => row.map(() => ({ type: 'obstacle' })))
  state.grid[2][2] = { type: 'empty' }
  state.grid[2][3] = { type: 'grass' }
  fixedRandom(.99, () => {
    for (let i = 0; i < 30; i++) {
      state = stepSimulation(state)
      assert.equal(state.agents[1].health, 70)
      assert.equal(isHidden(state.agents[1], state.grid, state.tick), true)
    }
    state = stepSimulation(state)
    assert.equal(isHidden(state.agents[1], state.grid, state.tick), false)
    assert.ok(state.agents[1].health < 70)
    assert.ok(state.events.some(event => event.tick === 31 && event.action === 'attack'))
  })
})

test('shared ally vision cannot reveal hidden targets or make hunters pursue them', () => {
  const grid = createGrid(config.world)
  const hunter = createAgent('h', 'Hunter', { x: 1, y: 1 }, '#fff', { ...zero, aggression: 1, riskTolerance: 1 })
  const scout = createAgent('s', 'Scout', { x: 6, y: 1 }, '#fff', zero)
  const target = createAgent('t', 'Target', { x: 7, y: 1 }, '#fff', zero)
  getOrInitRelation(hunter, scout.id).allied = true
  grid[1][7] = { type: 'grass' }
  fixedRandom(.99, () => {
    assert.deepEqual(decideAction(hunter, [hunter, scout, target], grid, 1, 0).targetPos, { x: 2, y: 1 })
    target.hiddenUntil = 31
    const hiddenAction = decideAction(hunter, [hunter, scout, target], grid, 1, 0)
    const noTargetAction = decideAction(hunter, [hunter, scout], grid, 1, 0)
    assert.deepEqual(hiddenAction, noTargetAction)
    assert.notDeepEqual(hiddenAction.targetPos, { x: 2, y: 1 })
    // Adjacent targets must also disappear from attack and alliance candidates.
    target.position = { x: 2, y: 1 }
    grid[1][2] = { type: 'grass' }
    assert.notEqual(decideAction(hunter, [hunter, target], grid, 1, 0).type, 'attack')
    hunter.traits.trust = 1
    assert.notEqual(decideAction(hunter, [hunter, target], grid, 1, 0).type, 'offer-alliance')
  })
})

test('moving through grass preserves the deadline; leaving and reentering cannot bypass cooldown', () => {
  let state = createSimulation(config)
  const runner = createAgent('r', 'Runner', { x: 1, y: 1 }, '#fff', zero)
  runner.health = 25
  runner.hiddenUntil = 31
  runner.hideAvailableAt = 61
  state.tick = 1
  state.agents = [runner, createAgent('h', 'Hunter', { x: 9, y: 9 }, '#fff', zero)]
  state.grid[1][1] = { type: 'grass' }
  state.grid[1][2] = { type: 'grass' }
  state.grid[1][4] = { type: 'resource', resourceAmount: 10 }
  fixedRandom(.99, () => {
    state = stepSimulation(state)
    assert.deepEqual(state.agents[0].position, { x: 2, y: 1 })
    assert.equal(state.agents[0].hiddenUntil, 31)
    state = stepSimulation(state)
    assert.deepEqual(state.agents[0].position, { x: 3, y: 1 })
    assert.equal(state.agents[0].hiddenUntil, 0)
    state.grid[1][4] = { type: 'grass' }
    state.agents[1].position = { x: 2, y: 1 }
    state.grid[0][3] = { type: 'obstacle' }
    state.grid[2][3] = { type: 'obstacle' }
    state = stepSimulation(state)
    assert.deepEqual(state.agents[0].position, { x: 4, y: 1 })
    assert.equal(isHidden(state.agents[0], state.grid, state.tick), false)
    state.tick = 60
    state.agents[0].position = { x: 3, y: 1 }
    state.agents[1].position = { x: 2, y: 1 }
    state = stepSimulation(state)
    assert.equal(isHidden(state.agents[0], state.grid, state.tick), true)
    assert.equal(state.agents[0].hiddenUntil, 91)
  })
})

test('hidden agents can heal but still take death-zone damage', () => {
  let state = createSimulation(config)
  const runner = createAgent('r', 'Runner', { x: 0, y: 0 }, '#fff', zero)
  runner.health = 25
  runner.resources = 20
  runner.hiddenUntil = 31
  state.agents = [runner, createAgent('h', 'Hunter', { x: 9, y: 9 }, '#fff', zero)]
  state.grid[0][0] = { type: 'grass' }
  state.grid[1][0] = { type: 'obstacle' }
  state.grid[0][1] = { type: 'obstacle' }
  fixedRandom(.99, () => {
    state = stepSimulation(state)
    assert.equal(state.agents[0].health, 55)
    assert.equal(state.agents[0].resources, 0)
    assert.equal(isHidden(state.agents[0], state.grid, state.tick), true)
    state.tick = 1100
    state.agents[0].hiddenUntil = 1130
    state = stepSimulation(state)
    assert.equal(state.agents[0].health, 52)
    assert.equal(isHidden(state.agents[0], state.grid, state.tick), true)
  })
})

test('all traits remain bounded with equal budgets, including zero and concentrated inputs', () => {
  assertBudget(normalizeTraits(zero))
  assertBudget(normalizeTraits({ ...zero, intellect: 1 }))
  for (const preset of AGENT_PRESETS) assertBudget(preset.traits)
  for (let i = 0; i < 1000; i++) assertBudget(randomizeTraits())
})

test('a defeated agent cannot act later in the tick', () => {
  const state = createSimulation(config)
  const attacker = createAgent('a', 'Attacker', { x: 2, y: 2 }, '#fff', { ...zero, aggression: 1, riskTolerance: 1 })
  const victim = createAgent('b', 'Victim', { x: 3, y: 2 }, '#fff', { ...zero, greed: 1 })
  victim.health = 1
  victim.resources = 40
  state.agents = [attacker, victim]
  state.grid[2][4] = { type: 'resource', resourceAmount: 15 }
  const before = JSON.stringify(state)
  fixedRandom(.99, () => {
    const next = stepSimulation(state)
    assert.equal(next.agents[1].alive, false)
    assert.equal(next.agents[1].resources, 40)
    assert.equal(next.agents[0].resources, 20)
    assert.equal(next.grid[2][4].resourceAmount, 15)
    assert.ok(next.events.every(event => event.agentId !== victim.id && event.tick === 1))
    assert.deepEqual(next.winners.map(agent => agent.id), ['a'])
    assert.equal(JSON.stringify(state), before, 'stepping must not mutate the previous state')
  })
})

test('stationary actions reset interpolation to the current position', () => {
  const state = createSimulation(config)
  const agent = createAgent('a', 'Gatherer', { x: 2, y: 2 }, '#fff', { ...zero, greed: 1 })
  agent.prevPosition = { x: 1, y: 2 }
  state.agents = [agent, createAgent('b', 'Other', { x: 9, y: 9 }, '#fff', zero)]
  state.grid[2][3] = { type: 'resource', resourceAmount: 10 }
  fixedRandom(.99, () => {
    const next = stepSimulation(state)
    assert.deepEqual(next.agents[0].position, { x: 2, y: 2 })
    assert.deepEqual(next.agents[0].prevPosition, next.agents[0].position)
  })
})

test('alliance countdown starts on the first completed tick and runs for 60 ticks', () => {
  let state = createSimulation(config)
  for (const agent of state.agents) {
    agent.traits = { ...zero, loyalty: 1 }
    for (const other of state.agents) if (agent.id !== other.id) getOrInitRelation(agent, other.id).allied = true
  }
  fixedRandom(.99, () => {
    state = stepSimulation(state)
    assert.equal(state.standoffSince, 1)
    for (let i = 0; i < 59; i++) state = stepSimulation(state)
    assert.equal(state.winners.length, 0)
    state = stepSimulation(state)
    assert.equal(state.winners.length, 2)
  })
})

test('tick limit stops playback and prevents further stepping', () => {
  const state = createSimulation({ ...config, maxTicks: 1 })
  state.running = true
  const next = stepSimulation(state)
  assert.equal(next.tick, 1)
  assert.equal(next.running, false)
  assert.equal(stepSimulation(next), next)
})

test('new worlds clear selection and completed runs cannot restart', () => {
  const store = useSimulationStore
  store.getState().selectAgent('agent-0')
  store.getState().setConfig({ ...config, tickIntervalMs: 80 })
  assert.equal(store.getState().selectedAgentId, null)
  assert.equal(store.getState().tickIntervalMs, 80)
  store.getState().selectAgent('agent-0')
  store.getState().randomize()
  assert.equal(store.getState().selectedAgentId, null)
  store.setState(state => ({ simulation: { ...state.simulation, draw: true } }))
  store.getState().start()
  assert.equal(store.getState().simulation.running, false)
})

test('merging alliances protects every member of both groups', () => {
  const state = createSimulation(config)
  state.agents = [0, 1, 2, 3].map(i => createAgent(String(i), String(i), { x: i * 2, y: 0 }, '#fff', { ...zero, loyalty: 1, memory: 1, trust: i === 0 ? 1 : .2 }))
  for (const [a, b] of [[0, 1], [2, 3]]) {
    getOrInitRelation(state.agents[a], String(b)).allied = true
    getOrInitRelation(state.agents[b], String(a)).allied = true
  }
  fixedRandom(.1, () => {
    const next = stepSimulation(state)
    assert.ok(next.events.some(event => event.action === 'accept-alliance'))
    for (const agent of next.agents) {
      for (const other of next.agents) {
        if (agent.id !== other.id) assert.equal(agent.relations[other.id]?.allied, true)
      }
    }
  })
})
