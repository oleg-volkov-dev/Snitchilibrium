# Snitchilibrium

A grid-based multi-agent simulation where autonomous agents gather resources, form alliances, betray each other, and compete under game-theoretic incentives.

## Run

```bash
nvm use 20
npm install
npm run dev
```

Open http://localhost:5173

## Agents

Two modes selectable in the config panel:

- **Preset (default)** — 12 named archetypes with fixed trait distributions: Maximizer, Opportunist, Loyalist, Paranoid, Vengeful, Merchant, Expansionist, Coward, Berserker, Manipulator, TitForTat, Chaotic.
- **Random** — traits are randomized, but every agent's traits always sum to the same total so no agent has an inherent stat advantage.

## Traits

| Trait | Effect |
|---|---|
| Aggression | Attacks adjacent enemies; chases enemies without nearby resources |
| Trust | Gullibility — only agents above 0.55 initiate or accept alliances |
| Loyalty | Resists betrayal; shares resources with struggling allies; rushes to support allies under attack |
| Greed | Prioritises gathering; tempts betrayal when an ally has more |
| Risk Tolerance | Cowardly agents flee when hurt; brave agents target strong enemies |
| Memory | Sets vision radius (3–12 tiles); high-memory agents also avoid retracing their steps |
| Irrationality | Adds noise to all decisions; occasionally triggers a fully random action |

**Vision** is limited to each agent's memory-derived radius. Allied agents share vision — each ally's field of view is visible to the group.

## Mechanics

**Actions:** move, gather, attack, heal, share, offer/accept/reject alliance, support ally, betray ally

**Combat:** adjacent attack. Each allied agent standing nearby adds +50% damage. Agents retreat when health is low.

**Alliances:** prevent mutual attacks; merge the group's vision; split gathered and looted resources evenly. Betrayal breaks all group bonds at once, steals 35% from the target, and damages reputation. Betrayal pressure is driven by greed and standoff duration — not by age alone.

**Death Zone:** starting at tick 1500, a fire ring closes in from the edges toward the center, dealing damage each tick to agents outside the safe radius. By the end, surviving agents are forced into a shrinking arena.

## Winning

- First agent to accumulate 100 resources wins.
- Last agent alive wins if no one reaches the threshold.
- If all survivors are mutually allied for 60 ticks without betrayal, the alliance wins together.
- If all agents die simultaneously, no winner is declared.

## Stack

React 18, TypeScript, Vite, Zustand
