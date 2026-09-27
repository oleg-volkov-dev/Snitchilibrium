import { useEffect, useMemo, useRef, useState } from 'react'
import { SimulationState } from '../../simulation/types'
import { getVisionRadius } from '../../simulation/agent'
import { getSafeRadius } from '../../simulation/utils'
import { useSimulationStore } from '../../store/simulationStore'
import { agentArtwork } from '../agentArtwork'
import { isHidden } from '../../simulation/concealment'
import rockArtwork from '../../../designs/Rock.png'
import coinArtwork from '../../../designs/Gold.png'
import grassArtwork from '../../../designs/Grass.png'
import styles from './Grid.module.css'

const CELL_SIZE = 26

// Ease in-out cubic so movement accelerates then decelerates
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

const terrainArtwork = new Map([
  ['obstacle', rockArtwork],
  ['resource', coinArtwork],
  ['grass', grassArtwork],
])

function drawTileArtwork(ctx: CanvasRenderingContext2D, sprite: HTMLImageElement | undefined, x: number, y: number, scale = 1.2) {
  if (!sprite?.complete || !sprite.naturalWidth) return
  const size = CELL_SIZE * scale
  ctx.drawImage(sprite, (x + .5) * CELL_SIZE - size / 2, (y + .5) * CELL_SIZE - size / 2, size, size)
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  simulation: SimulationState,
  selectedAgentId: string | null,
  progress: number,
  terrain: HTMLCanvasElement,
  showLabels: boolean,
  sprites: Map<string, HTMLImageElement>,
  terrainSprites: Map<string, HTMLImageElement>
) {
  const { grid, agents } = simulation
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const W = cols * CELL_SIZE
  const H = rows * CELL_SIZE
  const t = ease(progress)

  ctx.clearRect(0, 0, W, H)

  ctx.drawImage(terrain, 0, 0, W, H)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = grid[y][x]
      if (cell.type === 'resource') {
        const scale = .85 + Math.min(1, (cell.resourceAmount ?? 0) / 20) * .3
        drawTileArtwork(ctx, terrainSprites.get('resource'), x, y, scale)
      }
    }
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
    if (!agent.alive || isHidden(agent, grid, simulation.tick)) continue
    for (const [targetId, rel] of Object.entries(agent.relations)) {
      if (!rel.allied) continue
      const key = [agent.id, targetId].sort().join('|')
      if (drawn.has(key)) continue
      drawn.add(key)
      const target = agents.find(a => a.id === targetId)
      if (!target?.alive || isHidden(target, grid, simulation.tick)) continue
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
      if (a.alive && !isHidden(a, grid, simulation.tick) && a.id !== selectedAgent.id && selectedAgent.relations[a.id]?.allied) {
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
    const hidden = isHidden(agent, grid, simulation.tick)
    ctx.save()
    if (hidden) ctx.globalAlpha = .45
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
      ctx.globalAlpha = 1
      ctx.font = `${isSelected ? 600 : 500} 10px system-ui, sans-serif`
      const label = hidden ? `${agent.name} · hiding ${agent.hiddenUntil - simulation.tick}t` : agent.name
      const labelWidth = ctx.measureText(label).width + 12
      const labelX = Math.max(2, Math.min(W - labelWidth - 2, cx - labelWidth / 2))
      const labelY = cy > 30 ? cy - 30 : cy + 18
      ctx.fillStyle = isSelected ? '#d8f9ed' : 'rgba(8,18,24,.88)'
      ctx.fillRect(labelX, labelY, labelWidth, 15)
      ctx.fillStyle = isSelected ? '#132b24' : '#dce8e3'
      ctx.fillText(label, labelX + labelWidth / 2, labelY + 7.5)
    }
    ctx.restore()
  }

  // Brief action traces make combat readable at normal and slow speeds.
  if (progress < 1) {
    for (const event of simulation.events.filter(e => e.tick === simulation.tick && (e.action === 'attack' || e.action === 'betray-ally'))) {
      const source = agents.find(a => a.id === event.agentId)
      const target = agents.find(a => a.id === event.targetId)
      if (!source || !target) continue
      if (isHidden(source, grid, simulation.tick) || isHidden(target, grid, simulation.tick)) continue
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
  const terrainKey = useMemo(() => simulation.grid.map(row => row.map(cell => cell.type === 'obstacle' ? 'R' : cell.type === 'grass' ? 'G' : '.').join('')).join('|'), [simulation.grid])

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
    let raf = 0
    let lastFrame = ''
    let lastSimulation: SimulationState | null = null
    const terrainSprites = new Map<string, HTMLImageElement>()
    const tiles = terrainKey.split('|')
    const paintTerrain = () => {
      ground.fillStyle = '#163326'
      ground.fillRect(0, 0, logicalW, logicalH)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const type = tiles[y][x] === 'R' ? 'obstacle' : tiles[y][x] === 'G' ? 'grass' : ''
          if (type) drawTileArtwork(ground, terrainSprites.get(type), x, y)
        }
      }
      lastFrame = ''
    }
    for (const [type, src] of terrainArtwork) {
      const sprite = new Image()
      sprite.onload = paintTerrain
      terrainSprites.set(type, sprite)
      sprite.src = src
    }
    paintTerrain()
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
        drawGrid(ctx, simRef.current, selectedRef.current, progress, terrain, labelsRef.current, sprites, terrainSprites)
        lastFrame = frame
        lastSimulation = simRef.current
      }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      for (const sprite of [...sprites.values(), ...terrainSprites.values()]) sprite.onload = null
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
      <div className={styles.legend}>Faded agents are hiding in grass for up to 30 ticks. They remain visible to you, but concealed from other agents.</div>
    </div>
  )
}
