import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgent, getOrInitRelation, randomizeTraits } from '../src/simulation/agent'
import { createSimulation, stepSimulation } from '../src/simulation/engine'
import { AGENT_PRESETS } from '../src/simulation/presets'
import { normalizeTraits } from '../src/simulation/traits'
import { AgentTraits, SimulationConfig } from '../src/simulation/types'
import { useSimulationStore } from '../src/store/simulationStore'

const config: SimulationConfig = {
  world: { width: 10, height: 10, agentCount: 2, resourceDensity: 0, obstacleDensity: 0, defaultTraits: {}, deathZoneStart: 1500 },
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
