import { useEffect, useRef } from 'react'
import { AgentState, Cell, SimulationState } from '../../simulation/types'
import { useSimulationStore } from '../../store/simulationStore'
import styles from './Grid.module.css'

const CELL_SIZE = 24

function drawGrid(
  ctx: CanvasRenderingContext2D,
  simulation: SimulationState,
  selectedAgentId: string | null
) {
  const { grid, agents } = simulation
  const rows = grid.length
  const cols = grid[0]?.length ?? 0

  ctx.clearRect(0, 0, cols * CELL_SIZE, rows * CELL_SIZE)

  // Draw cells
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell: Cell = grid[y][x]
      if (cell.type === 'obstacle') {
        ctx.fillStyle = '#374151'
      } else if (cell.type === 'resource') {
        const intensity = Math.min(1, (cell.resourceAmount ?? 0) / 50)
        ctx.fillStyle = `rgba(34, 197, 94, ${0.3 + intensity * 0.6})`
      } else {
        ctx.fillStyle = '#111827'
      }
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 0.5
      ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
    }
  }

  // Draw alliance lines
  const drawn = new Set<string>()
  for (const agent of agents) {
    if (!agent.alive) continue
    for (const [targetId, rel] of Object.entries(agent.relations)) {
      if (!rel.allied) continue
      const key = [agent.id, targetId].sort().join('|')
      if (drawn.has(key)) continue
      drawn.add(key)
      const target = agents.find(a => a.id === targetId)
      if (!target || !target.alive) continue
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(agent.position.x * CELL_SIZE + CELL_SIZE / 2, agent.position.y * CELL_SIZE + CELL_SIZE / 2)
      ctx.lineTo(target.position.x * CELL_SIZE + CELL_SIZE / 2, target.position.y * CELL_SIZE + CELL_SIZE / 2)
      ctx.stroke()
    }
  }

  // Draw agents
  for (const agent of agents) {
    if (!agent.alive) continue
    const cx = agent.position.x * CELL_SIZE + CELL_SIZE / 2
    const cy = agent.position.y * CELL_SIZE + CELL_SIZE / 2
    const radius = CELL_SIZE / 2 - 2
    const isSelected = agent.id === selectedAgentId

    // Health arc
    const healthFraction = agent.health / 100
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 2, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * healthFraction)
    ctx.strokeStyle = healthFraction > 0.5 ? '#22c55e' : healthFraction > 0.25 ? '#f59e0b' : '#ef4444'
    ctx.lineWidth = 2
    ctx.stroke()

    // Body
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
    ctx.fillStyle = agent.color
    ctx.fill()

    if (isSelected) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Initial
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${CELL_SIZE * 0.45}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(agent.name[0], cx, cy)

    // Defending indicator
    if (agent.defending) {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.6)'
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
      ctx.fill()
    }
  }
}

export function Grid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simulation = useSimulationStore(s => s.simulation)
  const selectedAgentId = useSimulationStore(s => s.selectedAgentId)
  const selectAgent = useSimulationStore(s => s.selectAgent)

  const rows = simulation.grid.length
  const cols = simulation.grid[0]?.length ?? 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawGrid(ctx, simulation, selectedAgentId)
  }, [simulation, selectedAgentId])

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE)
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE)
    const clicked = simulation.agents.find(
      a => a.alive && a.position.x === x && a.position.y === y
    )
    selectAgent(clicked?.id ?? null)
  }

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      width={cols * CELL_SIZE}
      height={rows * CELL_SIZE}
      onClick={handleClick}
    />
  )
}
