import { useEffect, useRef } from 'react'
import { Cell, SimulationState } from '../../simulation/types'
import { getVisionRadius } from '../../simulation/agent'
import { getSafeRadius } from '../../simulation/utils'
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

  // Vision radius overlay for selected agent + their allies (shared vision)
  const selectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId && a.alive) : null
  if (selectedAgent) {
    const drawVisionCircle = (
      vAgent: typeof agents[number],
      isOwn: boolean
    ) => {
      const { cx, cy } = agentCenter(vAgent)
      const vrPx = getVisionRadius(vAgent.traits.memory) * CELL_SIZE

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, vrPx)
      if (isOwn) {
        grad.addColorStop(0, 'rgba(99, 102, 241, 0.06)')
        grad.addColorStop(0.75, 'rgba(99, 102, 241, 0.08)')
      } else {
        // Allied vision: amber tint to visually distinguish
        grad.addColorStop(0, 'rgba(251, 191, 36, 0.03)')
        grad.addColorStop(0.75, 'rgba(251, 191, 36, 0.05)')
      }
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, vrPx, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, vrPx, 0, Math.PI * 2)
      ctx.strokeStyle = isOwn ? 'rgba(99, 102, 241, 0.4)' : 'rgba(251, 191, 36, 0.25)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.restore()
    }

    // Draw ally circles first (behind), then own circle on top
    for (const a of agents) {
      if (a.alive && a.id !== selectedAgent.id && selectedAgent.relations[a.id]?.allied) {
        drawVisionCircle(a, false)
      }
    }
    drawVisionCircle(selectedAgent, true)
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

  // Death zone overlay — drawn last so it tints everything outside the safe circle
  const { tick } = simulation
  const { deathZoneStart } = simulation.config.world
  const safeRadius = getSafeRadius(tick, cols, rows, deathZoneStart)
  if (safeRadius !== Infinity) {
    const mapCx = (cols / 2) * CELL_SIZE
    const mapCy = (rows / 2) * CELL_SIZE
    const safeRadiusPx = safeRadius * CELL_SIZE
    // Pulsing opacity on the border (uses real time so it animates even when paused)
    const pulse = 0.55 + 0.25 * Math.sin(performance.now() / 400)

    // Dark red fill outside the safe circle using even-odd winding rule
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.arc(mapCx, mapCy, Math.max(0, safeRadiusPx), 0, Math.PI * 2, true)
    ctx.fillStyle = 'rgba(180, 20, 20, 0.28)'
    ctx.fill('evenodd')
    ctx.restore()

    // Inner edge glow gradient
    if (safeRadiusPx > 0) {
      const edgeGrad = ctx.createRadialGradient(mapCx, mapCy, Math.max(0, safeRadiusPx - CELL_SIZE * 1.5), mapCx, mapCy, safeRadiusPx + CELL_SIZE * 0.5)
      edgeGrad.addColorStop(0, 'rgba(239, 68, 68, 0)')
      edgeGrad.addColorStop(0.6, `rgba(239, 68, 68, ${pulse * 0.35})`)
      edgeGrad.addColorStop(1, `rgba(239, 68, 68, ${pulse * 0.6})`)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, W, H)
      ctx.arc(mapCx, mapCy, Math.max(0, safeRadiusPx - CELL_SIZE * 1.5), 0, Math.PI * 2, true)
      ctx.fillStyle = edgeGrad
      ctx.fill('evenodd')
      ctx.restore()

      // Sharp border ring
      ctx.save()
      ctx.beginPath()
      ctx.arc(mapCx, mapCy, safeRadiusPx, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }
  }

  // Approaching warning: subtle vignette when zone is 300 ticks away
  if (tick >= deathZoneStart - 300 && safeRadius === Infinity) {
    const warnProgress = (tick - (deathZoneStart - 300)) / 300
    const vign = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
    vign.addColorStop(0, 'rgba(180,20,20,0)')
    vign.addColorStop(1, `rgba(180,20,20,${warnProgress * 0.18})`)
    ctx.fillStyle = vign
    ctx.fillRect(0, 0, W, H)
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
