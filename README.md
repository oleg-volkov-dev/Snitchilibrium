# Snitchilibrium

A grid-based multi-agent strategy sandbox where autonomous agents gather resources, form coalitions, betray allies, and compete under game-theoretic incentives.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Features

- 2D grid world with resources and obstacles
- Agents with configurable traits: aggression, trust, loyalty, greed, risk tolerance, memory, irrationality
- Actions: move, gather, attack, defend, offer/accept/reject alliance, support ally, betray ally
- Utility-based decision making with tunable irrationality
- Dynamic trust and resentment between agents
- Temporary coalitions with defection mechanics
- Leaderboard, event log, and agent detail panel
- Controls: start, pause, step, reset, speed, randomize, world config

## Stack

- React 18 + TypeScript
- Vite
- Zustand (state management)
- Canvas-based grid renderer
