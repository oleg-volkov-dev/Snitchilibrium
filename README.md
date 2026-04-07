# Snitchilibrium

A grid-based multi-agent simulation where autonomous agents gather resources, form alliances, betray each other, and compete under game-theoretic incentives.

## Run

```bash
nvm use 20
npm install
npm run dev
```

Open http://localhost:5173

## Rules

Agents act every tick using utility-based decisions. Each has randomized traits:

| Trait | Effect |
|---|---|
| Aggression | Attacks adjacent enemies; high aggression chases enemies even without resources nearby |
| Trust | Gullibility — only agents above 0.55 initiate or accept alliances |
| Loyalty | Resists betrayal; loyal agents share resources with struggling allies and rush to support allies under attack |
| Greed | Prioritises gathering; tempts betrayal when an ally is richer; suppresses sharing |
| Risk Tolerance | Cowardly agents flee when hurt and penalise outnumbered attacks; brave agents target strong enemies |
| Memory | Determines resource scan radius and how long trust/resentment persists; high-memory agents navigate toward last known resource positions |
| Irrationality | Adds noise to all decisions; high irrationality occasionally causes a completely random action |

**Actions:** move, gather, attack, heal, share, offer/accept/reject alliance, support ally, betray ally

**Combat:** attacking an adjacent enemy deals damage. Each allied agent standing next to the fight adds +50% damage. Cowardly or rational agents retreat when health is low.

**Healing:** agents spend 20 resources to recover 30 HP. Cautious agents prioritise this over fighting.

**Alliances:** prevent mutual attacks. Joining a group ally binds you to all its members at once. Gathered and looted resources are split evenly across the group. Loyal agents proactively share resources with poorer allies and move to support allies under attack. Betraying breaks all group bonds simultaneously, steals 35% from the target, and damages your reputation.

**Winning:**
- First agent to accumulate 100 resources wins.
- Last agent alive wins if no one reaches the threshold.
- If all survivors are mutually allied for 60 ticks without betrayal, the alliance wins together.
- If all agents die simultaneously, no winner is declared.

## Stack

React 18, TypeScript, Vite, Zustand
