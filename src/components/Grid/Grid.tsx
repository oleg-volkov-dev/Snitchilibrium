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

// Deterministic pseudo-random [0,1] keyed to a grid cell + seed index.
// Same cell always produces the same value so rocks look stable across frames.
function cellRng(gx: number, gy: number, seed: number): number {
  const s = Math.sin(gx * 127.1 + gy * 311.7 + seed * 74.3)
  return s - Math.floor(s)
}

// Dark stone-floor texture for one cell.
// Low-frequency slab pattern + per-cell grain gives visible stone variation.
function drawGroundCell(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r0 = cellRng(x, y, 0)
  const r1 = cellRng(x, y, 1)
  const r2 = cellRng(x, y, 2)
  // Low-frequency pattern simulates uneven stone slabs
  const slab = (Math.sin(x * 0.61 + y * 0.47) * Math.sin(x * 0.29 - y * 0.73) + 1) * 0.5
  const v = slab * 0.55 + r0 * 0.45
  const lum = Math.round(30 + v * 22)   // 30–52: dark but clearly visible stone
  // Slight warm/cool shift per cell so slabs have individual character
  const rch = Math.round(lum + r1 * 5 - 2)
  const bch = Math.round(lum - r2 * 4)
  ctx.fillStyle = `rgb(${rch},${lum},${bch})`
  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
}

// Procedural rock boulder: organic polygon, lit from top-left, with crack detail.
function drawRock(ctx: CanvasRenderingContext2D, gx: number, gy: number) {
  const cx = gx * CELL_SIZE + CELL_SIZE / 2
  const cy = gy * CELL_SIZE + CELL_SIZE / 2
  const rng = (n: number) => cellRng(gx, gy, n)
  const nPts = 10
  const baseR = CELL_SIZE * 0.43

  // Pre-generate organic outline — large radius variance makes rocks look natural
  const pts: [number, number][] = []
  for (let i = 0; i < nPts; i++) {
    const ang = (i / nPts) * Math.PI * 2 - Math.PI / 2
    const r = baseR * (0.55 + rng(i) * 0.45)   // variance 0.55–1.0 × baseR
    pts.push([Math.cos(ang) * r, Math.sin(ang) * r])
  }

  // Helper: trace the rock outline with an optional offset for the shadow
  const trace = (ox: number, oy: number) => {
    ctx.beginPath()
    ctx.moveTo(cx + pts[0][0] + ox, cy + pts[0][1] + oy)
    for (let i = 1; i < nPts; i++) ctx.lineTo(cx + pts[i][0] + ox, cy + pts[i][1] + oy)
    ctx.closePath()
  }

  // Drop shadow (offset copy of the polygon)
  trace(2.5, 3.5)
  ctx.fillStyle = 'rgba(0,0,0,0.48)'
  ctx.fill()

  // Rock body — warm grey-brown, lit from upper-left
  trace(0, 0)
  const hue = 28 + rng(9) * 24       // earthy brown-grey
  const sat = 6 + rng(10) * 10
  const hlx = cx - baseR * 0.28
  const hly = cy - baseR * 0.33
  const grad = ctx.createRadialGradient(hlx, hly, 0, cx + baseR * 0.15, cy + baseR * 0.2, baseR * 1.2)
  grad.addColorStop(0,    `hsl(${hue},${sat}%,${62 + rng(11) * 10}%)`)   // bright highlight
  grad.addColorStop(0.38, `hsl(${hue},${sat}%,${36 + rng(12) * 8}%)`)   // mid-tone
  grad.addColorStop(1,    `hsl(${hue},${sat}%,${15 + rng(13) * 6}%)`)   // dark shadow edge
  ctx.fillStyle = grad
  ctx.fill()

  // Outline — slightly darker than the dark edge
  ctx.strokeStyle = `hsl(${hue},${sat}%,10%)`
  ctx.lineWidth = 0.9
  ctx.stroke()

  // Specular highlight dot at top-left
  ctx.beginPath()
  ctx.arc(hlx + baseR * 0.1, hly + baseR * 0.12, baseR * 0.13, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(255,255,255,${0.22 + rng(14) * 0.14})`
  ctx.fill()

  // Crack detail — present on ~65 % of rocks
  if (rng(15) > 0.35) {
    const x1 = cx + (rng(16) - 0.5) * baseR * 0.8
    const y1 = cy + (rng(17) - 0.5) * baseR * 0.55
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 + (rng(18) - 0.5) * baseR * 0.65, y1 + rng(19) * baseR * 0.45)
    ctx.strokeStyle = `rgba(0,0,0,${0.32 + rng(20) * 0.26})`
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
}

// Diamond gem resource: glowing halo + faceted shape + specular dot.
function drawResource(ctx: CanvasRenderingContext2D, x: number, y: number, cell: Cell) {
  const cx = x * CELL_SIZE + CELL_SIZE / 2
  const cy = y * CELL_SIZE + CELL_SIZE / 2
  const intensity = Math.min(1, (cell.resourceAmount ?? 0) / 20)
  const gemR = CELL_SIZE * (0.15 + 0.18 * intensity)

  // Outer glow halo
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, gemR * 2.8)
  halo.addColorStop(0,    `rgba(74,222,128,${0.40 + intensity * 0.35})`)
  halo.addColorStop(0.45, `rgba(34,197,94,${0.15 + intensity * 0.15})`)
  halo.addColorStop(1,    'rgba(34,197,94,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, cy, gemR * 2.8, 0, Math.PI * 2)
  ctx.fill()

  // Diamond / gem silhouette
  ctx.beginPath()
  ctx.moveTo(cx,                cy - gemR)
  ctx.lineTo(cx + gemR * 0.68,  cy)
  ctx.lineTo(cx,                cy + gemR * 0.82)
  ctx.lineTo(cx - gemR * 0.68,  cy)
  ctx.closePath()

  const gemGrad = ctx.createLinearGradient(cx, cy - gemR, cx, cy + gemR)
  gemGrad.addColorStop(0,   'rgba(187,247,208,0.95)')
  gemGrad.addColorStop(0.4, 'rgba(52,211,153,0.90)')
  gemGrad.addColorStop(1,   'rgba(6,78,59,0.85)')
  ctx.fillStyle = gemGrad
  ctx.fill()
  ctx.strokeStyle = `rgba(134,239,172,${0.60 + intensity * 0.35})`
  ctx.lineWidth = 0.75
  ctx.stroke()

  // Top-facet crease
  ctx.beginPath()
  ctx.moveTo(cx - gemR * 0.68, cy)
  ctx.lineTo(cx, cy - gemR)
  ctx.lineTo(cx + gemR * 0.68, cy)
  ctx.strokeStyle = `rgba(187,247,208,${0.28 + intensity * 0.22})`
  ctx.lineWidth = 0.5
  ctx.stroke()

  // Specular dot
  ctx.beginPath()
  ctx.arc(cx - gemR * 0.22, cy - gemR * 0.28, gemR * 0.18, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(255,255,255,${0.60 + intensity * 0.30})`
  ctx.fill()
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

  // Ground: per-cell stone-floor texture (all cells, obstacles get it too as a base)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      drawGroundCell(ctx, x, y)
    }
  }

  // Rocks — second pass so their drop-shadows sit on top of ground only
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x].type === 'obstacle') drawRock(ctx, x, y)
    }
  }

  // Resources — diamond gems with glow halos
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x].type === 'resource') drawResource(ctx, x, y, grid[y][x])
    }
  }

  // Arena vignette: darken the map edges to frame the battlefield
  const vign = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72)
  vign.addColorStop(0, 'rgba(0,0,0,0)')
  vign.addColorStop(1, 'rgba(0,0,0,0.52)')
  ctx.fillStyle = vign
  ctx.fillRect(0, 0, W, H)

  // Grid lines — kept faint for readability
  ctx.strokeStyle = 'rgba(255,255,255,0.022)'
  ctx.lineWidth = 0.5
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL_SIZE, 0); ctx.lineTo(x * CELL_SIZE, H); ctx.stroke()
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL_SIZE); ctx.lineTo(W, y * CELL_SIZE); ctx.stroke()
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
