import { useEffect, useRef } from 'react'
import { Cell, SimulationState } from '../../simulation/types'
import { useSimulationStore } from '../../store/simulationStore'
import styles from './Grid.module.css'

const CELL_SIZE = 26

// Ease in-out cubic so movement accelerates then decelerates
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  simulation: SimulationState,
  selectedAgentId: string | null,
  progress: number
) {
  const { grid, agents } = simulation
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const W = cols * CELL_SIZE
  const H = rows * CELL_SIZE
  const t = ease(progress)

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, W, H)

  // Cells
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell: Cell = grid[y][x]
      const cx = x * CELL_SIZE
      const cy = y * CELL_SIZE

      if (cell.type === 'obstacle') {
        ctx.fillStyle = '#1c2333'
        ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE)
        ctx.strokeStyle = '#263044'
        ctx.lineWidth = 1
        const pad = CELL_SIZE * 0.3
        ctx.beginPath()
        ctx.moveTo(cx + pad, cy + pad)
        ctx.lineTo(cx + CELL_SIZE - pad, cy + CELL_SIZE - pad)
        ctx.moveTo(cx + CELL_SIZE - pad, cy + pad)
        ctx.lineTo(cx + pad, cy + CELL_SIZE - pad)
        ctx.stroke()
      } else if (cell.type === 'resource') {
        ctx.fillStyle = '#0d1117'
        ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE)
        const intensity = Math.min(1, (cell.resourceAmount ?? 0) / 20)
        const rcx = cx + CELL_SIZE / 2
        const rcy = cy + CELL_SIZE / 2
        const r = CELL_SIZE * 0.1 + CELL_SIZE * 0.25 * intensity
        const grad = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, r * 2)
        grad.addColorStop(0, `rgba(74, 222, 128, ${0.6 + intensity * 0.4})`)
        grad.addColorStop(0.5, `rgba(34, 197, 94, ${0.25 + intensity * 0.3})`)
        grad.addColorStop(1, 'rgba(34, 197, 94, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(rcx, rcy, r * 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(134, 239, 172, ${0.7 + intensity * 0.3})`
        ctx.beginPath()
        ctx.arc(rcx, rcy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Grid lines (very subtle)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'
  ctx.lineWidth = 0.5
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath()
    ctx.moveTo(x * CELL_SIZE, 0)
    ctx.lineTo(x * CELL_SIZE, H)
    ctx.stroke()
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * CELL_SIZE)
    ctx.lineTo(W, y * CELL_SIZE)
    ctx.stroke()
  }

  // Interpolated agent center helper
  const agentCenter = (agent: typeof agents[number]) => {
    const px = agent.prevPosition.x + (agent.position.x - agent.prevPosition.x) * t
    const py = agent.prevPosition.y + (agent.position.y - agent.prevPosition.y) * t
    return { cx: px * CELL_SIZE + CELL_SIZE / 2, cy: py * CELL_SIZE + CELL_SIZE / 2 }
  }

  // Alliance lines (use interpolated positions)
  const drawn = new Set<string>()
  for (const agent of agents) {
    if (!agent.alive) continue
    for (const [targetId, rel] of Object.entries(agent.relations)) {
      if (!rel.allied) continue
      const key = [agent.id, targetId].sort().join('|')
      if (drawn.has(key)) continue
      drawn.add(key)
      const target = agents.find(a => a.id === targetId)
      if (!target?.alive) continue
      const a = agentCenter(agent)
      const b = agentCenter(target)
      ctx.save()
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(a.cx, a.cy)
      ctx.lineTo(b.cx, b.cy)
      ctx.stroke()
      ctx.restore()
    }
  }

  // Agents
  for (const agent of agents) {
    if (!agent.alive) continue
    const { cx, cy } = agentCenter(agent)
    const radius = CELL_SIZE * 0.36
    const isSelected = agent.id === selectedAgentId
    const healthFraction = agent.health / 100
    const healthColor = healthFraction > 0.5 ? '#4ade80' : healthFraction > 0.25 ? '#fbbf24' : '#f87171'

    // Glow
    ctx.save()
    ctx.shadowColor = agent.color
    ctx.shadowBlur = isSelected ? 14 : 6
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fillStyle = agent.color
    ctx.fill()
    ctx.restore()

    // Health ring background
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Health ring fill
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * healthFraction)
    ctx.strokeStyle = healthColor
    ctx.lineWidth = 2
    ctx.stroke()

    // Selection ring
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Name initial
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = `600 ${Math.round(CELL_SIZE * 0.42)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(agent.name[0], cx, cy + 0.5)

  }
}

export function Grid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simulation = useSimulationStore(s => s.simulation)
  const selectedAgentId = useSimulationStore(s => s.selectedAgentId)
  const selectAgent = useSimulationStore(s => s.selectAgent)
  const tickIntervalMs = useSimulationStore(s => s.tickIntervalMs)

  const rows = simulation.grid.length
  const cols = simulation.grid[0]?.length ?? 0

  // Refs so the RAF loop always reads the latest values without restarting
  const simRef = useRef(simulation)
  const selectedRef = useRef(selectedAgentId)
  const intervalRef = useRef(tickIntervalMs)
  const lastTickTimeRef = useRef(performance.now())
  const rafRef = useRef<number>(0)

  useEffect(() => {
    simRef.current = simulation
    lastTickTimeRef.current = performance.now()
  }, [simulation])

  useEffect(() => { selectedRef.current = selectedAgentId }, [selectedAgentId])
  useEffect(() => { intervalRef.current = tickIntervalMs }, [tickIntervalMs])

  // Canvas setup + RAF render loop — restarts only when grid dimensions change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const logicalW = cols * CELL_SIZE
    const logicalH = rows * CELL_SIZE
    canvas.width = logicalW * dpr
    canvas.height = logicalH * dpr
    canvas.style.width = `${logicalW}px`
    canvas.style.height = `${logicalH}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = () => {
      const elapsed = performance.now() - lastTickTimeRef.current
      const progress = Math.min(1, elapsed / Math.max(1, intervalRef.current))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawGrid(ctx, simRef.current, selectedRef.current, progress)
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [rows, cols])

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
      onClick={handleClick}
    />
  )
}
