import { Cell, CellType, Position, WorldConfig } from './types'
import { randomFloat } from './utils'

export function createGrid(config: WorldConfig): Cell[][] {
  const { width, height, resourceDensity, obstacleDensity } = config
  const grid: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'empty' as CellType }))
  )

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = randomFloat()
      if (r < obstacleDensity) {
        grid[y][x] = { type: 'obstacle' }
      } else if (r < obstacleDensity + resourceDensity) {
        grid[y][x] = { type: 'resource', resourceAmount: Math.floor(randomFloat(10, 50)) }
      }
    }
  }

  return grid
}

export function findEmptyPositions(grid: Cell[][], occupiedPositions: Position[]): Position[] {
  const occupied = new Set(occupiedPositions.map(p => `${p.x},${p.y}`))
  const empty: Position[] = []
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].type === 'empty' && !occupied.has(`${x},${y}`)) {
        empty.push({ x, y })
      }
    }
  }
  return empty
}

export function cellAt(grid: Cell[][], pos: Position): Cell | null {
  return grid[pos.y]?.[pos.x] ?? null
}

export function isPassable(grid: Cell[][], pos: Position): boolean {
  const cell = cellAt(grid, pos)
  return cell !== null && cell.type !== 'obstacle'
}

export function spawnResources(grid: Cell[][], rate: number): void {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].type === 'empty' && randomFloat() < rate) {
        grid[y][x] = { type: 'resource', resourceAmount: Math.floor(randomFloat(5, 20)) }
      }
    }
  }
}
