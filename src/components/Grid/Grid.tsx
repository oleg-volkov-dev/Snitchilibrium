import { useEffect, useMemo, useRef, useState } from 'react'
import { Cell, SimulationState } from '../../simulation/types'
import { getVisionRadius } from '../../simulation/agent'
import { getSafeRadius } from '../../simulation/utils'
import { useSimulationStore } from '../../store/simulationStore'
import { agentArtwork } from '../agentArtwork'
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

// Stable terrain texture with subtle tile seams and scattered grass.
function drawGroundCell(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const shade = 13 + cellRng(x, y, 30) * 3
  ctx.fillStyle = `hsl(158, 23%, ${shade}%)`
  ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
  ctx.strokeStyle = 'rgba(147, 197, 174, .045)'
  ctx.lineWidth = .5
  ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
  if (cellRng(x, y, 31) > .65) {
    const px = x * CELL_SIZE + cellRng(x, y, 32) * 20 + 3
    const py = y * CELL_SIZE + cellRng(x, y, 33) * 20 + 3
    ctx.strokeStyle = 'rgba(124, 175, 128, .18)'
    ctx.beginPath()
    ctx.moveTo(px - 2, py - 3); ctx.lineTo(px, py); ctx.lineTo(px + 1, py - 4)
    ctx.stroke()
  }
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

// Gold coin resource: flat yellow disc with rim, inner ring, and cross impression.
function drawResource(ctx: CanvasRenderingContext2D, x: number, y: number, cell: Cell) {
  const cx = x * CELL_SIZE + CELL_SIZE / 2
  const cy = y * CELL_SIZE + CELL_SIZE / 2
  const intensity = Math.min(1, (cell.resourceAmount ?? 0) / 20)
  const r = CELL_SIZE * (0.17 + 0.14 * intensity)

  // Soft yellow glow halo
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6)
  halo.addColorStop(0,   `rgba(253,224,71,${0.36 + intensity * 0.28})`)
  halo.addColorStop(0.5, `rgba(234,179,8,${0.12 + intensity * 0.10})`)
  halo.addColorStop(1,   'rgba(234,179,8,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2)
  ctx.fill()

  // Coin face — linear top-to-bottom gradient so it reads flat, not spherical
  const coinGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
  coinGrad.addColorStop(0,   '#fef08a')   // light yellow top
  coinGrad.addColorStop(0.45, '#fde047')  // bright yellow mid
  coinGrad.addColorStop(1,   '#ca8a04')   // darker gold bottom edge
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = coinGrad
  ctx.fill()

  // Thick rim — the key detail that reads as a coin edge
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#a16207'
  ctx.lineWidth = 1.6
  ctx.stroke()

  // Inner engraved ring
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(133,77,14,0.50)'
  ctx.lineWidth = 0.7
  ctx.stroke()

  // Cross impression on coin face
  const ir = r * 0.42
  ctx.strokeStyle = 'rgba(133,77,14,0.35)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(cx - ir, cy); ctx.lineTo(cx + ir, cy)
  ctx.moveTo(cx, cy - ir); ctx.lineTo(cx, cy + ir)
  ctx.stroke()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  simulation: SimulationState,
  selectedAgentId: string | null,
  progress: number,
  terrain: HTMLCanvasElement,
  showLabels: boolean,
  sprites: Map<string, HTMLImageElement>
) {
  const { grid, agents } = simulation
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const W = cols * CELL_SIZE
  const H = rows * CELL_SIZE
  const t = ease(progress)

  ctx.clearRect(0, 0, W, H)

  ctx.drawImage(terrain, 0, 0, W, H)

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
    const sprite = sprites.get(agent.name)
    const hasSprite = sprite?.complete && sprite.naturalWidth > 0
    const healthFraction = agent.health / 100
    const healthColor = healthFraction > 0.5 ? '#4ade80' : healthFraction > 0.25 ? '#fbbf24' : '#f87171'

    // Ground shadow and shaded agent token.
    ctx.beginPath()
    ctx.ellipse(cx + 2, cy + 5, radius + 2, radius * .65, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,.45)'
    ctx.fill()
    // Keep colored tokens as the fallback for agents without artwork.
    if (!hasSprite) {
      ctx.save()
      ctx.shadowColor = agent.color
      ctx.shadowBlur = isSelected ? 14 : 6
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      const body = ctx.createRadialGradient(cx - 3, cy - 4, 0, cx, cy, radius * 1.4)
      body.addColorStop(0, '#ecf5ff')
      body.addColorStop(.3, agent.color)
      body.addColorStop(1, '#111c2b')
      ctx.fillStyle = body
      ctx.fill()
      ctx.restore()
    }

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

    // Full character artwork, with the health and selection rings still visible.
    if (hasSprite) {
      const size = CELL_SIZE * 1.35
      ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = `600 ${Math.round(CELL_SIZE * 0.42)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#000'
    ctx.shadowBlur = 3
    if (!hasSprite) ctx.fillText(agent.name[0], cx, cy + 0.5)
    ctx.shadowBlur = 0

    if (showLabels || isSelected) {
      ctx.font = `${isSelected ? 600 : 500} 10px system-ui, sans-serif`
      const labelWidth = ctx.measureText(agent.name).width + 12
      const labelX = Math.max(2, Math.min(W - labelWidth - 2, cx - labelWidth / 2))
      const labelY = cy > 30 ? cy - 30 : cy + 18
      ctx.fillStyle = isSelected ? '#d8f9ed' : 'rgba(8,18,24,.88)'
      ctx.fillRect(labelX, labelY, labelWidth, 15)
      ctx.fillStyle = isSelected ? '#132b24' : '#dce8e3'
      ctx.fillText(agent.name, labelX + labelWidth / 2, labelY + 7.5)
    }

  }

  // Brief action traces make combat readable at normal and slow speeds.
  if (progress < 1) {
    for (const event of simulation.events.filter(e => e.tick === simulation.tick && (e.action === 'attack' || e.action === 'betray-ally'))) {
      const source = agents.find(a => a.id === event.agentId)
      const target = agents.find(a => a.id === event.targetId)
      if (!source || !target) continue
      const from = agentCenter(source)
      const to = agentCenter(target)
      ctx.save()
      ctx.globalAlpha = (1 - progress) * .8
      ctx.strokeStyle = event.action === 'attack' ? '#ff9b83' : '#e6a6ff'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(from.cx, from.cy); ctx.lineTo(to.cx, to.cy); ctx.stroke()
      ctx.beginPath(); ctx.arc(to.cx, to.cy, 10 + progress * 14, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
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
    const pulse = 0.7

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
  const [showLabels, setShowLabels] = useState(true)
  const [zoomed, setZoomed] = useState(false)
  const rows = simulation.grid.length
  const cols = simulation.grid[0]?.length ?? 0
  const terrainKey = useMemo(() => simulation.grid.map(row => row.map(cell => cell.type === 'obstacle' ? '1' : '0').join('')).join('|'), [simulation.grid])

  const simRef = useRef(simulation)
  const selectedRef = useRef(selectedAgentId)
  const labelsRef = useRef(showLabels)
  const intervalRef = useRef(tickIntervalMs)
  const lastTickTimeRef = useRef(performance.now())
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    if (simRef.current.grid !== simulation.grid) lastTickTimeRef.current = performance.now()
    simRef.current = simulation
  }, [simulation])
  useEffect(() => { selectedRef.current = selectedAgentId }, [selectedAgentId])
  useEffect(() => { intervalRef.current = tickIntervalMs }, [tickIntervalMs])
  useEffect(() => { labelsRef.current = showLabels }, [showLabels])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotionRef.current = media.matches }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const logicalW = cols * CELL_SIZE
    const logicalH = rows * CELL_SIZE
    canvas.width = logicalW * dpr
    canvas.height = logicalH * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const terrain = document.createElement('canvas')
    terrain.width = canvas.width
    terrain.height = canvas.height
    const ground = terrain.getContext('2d')
    if (!ground) return
    ground.scale(dpr, dpr)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) drawGroundCell(ground, x, y)
    }
    const rocks = terrainKey.split('|')
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) if (rocks[y][x] === '1') drawRock(ground, x, y)
    }

    let raf = 0
    let lastFrame = ''
    let lastSimulation: SimulationState | null = null
    const sprites = new Map<string, HTMLImageElement>()
    for (const [name, src] of agentArtwork) {
      const sprite = new Image()
      // A paused arena must repaint when its artwork finishes loading.
      sprite.onload = () => { lastFrame = '' }
      sprite.src = src
      sprites.set(name, sprite)
    }
    const render = () => {
      const elapsed = performance.now() - lastTickTimeRef.current
      const progress = reducedMotionRef.current ? 1 : Math.min(1, elapsed / Math.max(1, intervalRef.current))
      const frame = `${simRef.current.tick}/${selectedRef.current}/${labelsRef.current}/${progress}`
      if (frame !== lastFrame || lastSimulation !== simRef.current) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawGrid(ctx, simRef.current, selectedRef.current, progress, terrain, labelsRef.current, sprites)
        lastFrame = frame
        lastSimulation = simRef.current
      }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      for (const sprite of sprites.values()) sprite.onload = null
    }
  }, [rows, cols, terrainKey])

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / rect.width * cols
    const y = (e.clientY - rect.top) / rect.height * rows
    const progress = reducedMotionRef.current ? 1 : Math.min(1, (performance.now() - lastTickTimeRef.current) / Math.max(1, tickIntervalMs))
    const t = ease(progress)
    const clicked = simulation.agents.find(a => {
      const ax = a.prevPosition.x + (a.position.x - a.prevPosition.x) * t + .5
      const ay = a.prevPosition.y + (a.position.y - a.prevPosition.y) * t + .5
      return a.alive && Math.hypot(ax - x, ay - y) <= .65
    })
    selectAgent(clicked?.id ?? null)
  }

  return (
    <div className={styles.arena}>
      <div className={styles.toolbar}>
        <span><i />WORLD VIEW</span>
        <div>
          <button aria-pressed={showLabels} onClick={() => setShowLabels(value => !value)}>Names {showLabels ? 'on' : 'off'}</button>
          <button aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? 'Fit to view' : 'Zoom 1:1'}</button>
        </div>
      </div>
      <div className={styles.viewport}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ width: zoomed ? cols * CELL_SIZE : '100%' }}
          onClick={handleClick}
          aria-label="Simulation arena. Use the leaderboard buttons to select and inspect agents."
          role="img"
        />
      </div>
    </div>
  )
}
