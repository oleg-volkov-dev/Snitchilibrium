import { Position } from './types'

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function randomFloat(min = 0, max = 1): number {
  return min + Math.random() * (max - min)
}

export function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

export function weightedRandom(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

export function adjacentPositions(pos: Position, width: number, height: number): Position[] {
  const dirs = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ]
  return dirs
    .map(d => ({ x: pos.x + d.x, y: pos.y + d.y }))
    .filter(p => p.x >= 0 && p.x < width && p.y >= 0 && p.y < height)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const AGENT_NAMES = [
  'Voss', 'Mira', 'Sable', 'Cain', 'Lyra', 'Dex', 'Nyx', 'Rook',
  'Fen', 'Tara', 'Oryn', 'Zola', 'Bjorn', 'Skye', 'Ash', 'Petra',
  'Vale', 'Kael', 'Ona', 'Brix',
]

export function generateAgentName(index: number): string {
  return AGENT_NAMES[index % AGENT_NAMES.length]
}

const AGENT_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

export function agentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}
