# Snitchilibrium

A grid-based multi-agent simulation where autonomous agents gather resources, form alliances, and betray each other under game-theoretic incentives.

## Run

```bash
nvm use 20
npm install
npm run dev
```

Open http://localhost:5173

## Rules

Agents act every tick using utility-based decisions. Each has randomized traits that shape their behavior:

| Trait | Effect |
|---|---|
| Aggression | Likelihood to attack adjacent enemies |
| Trust | Willingness to accept and offer alliances |
| Loyalty | Resistance to betraying allies |
| Greed | Priority on gathering resources |
| Risk Tolerance | Weights attack vs. caution |
| Memory | How long trust/resentment persists |
| Irrationality | Random deviation from optimal decisions |

**Actions:** move, gather, attack, defend, offer/accept/reject alliance, betray ally

**Combat:** attacking an adjacent enemy deals damage. Allied agents standing next to a fight add +25% damage each.

**Alliances:** prevent mutual attacks. Betraying an ally steals 35% of their resources and damages your reputation with all other agents.

**Winning:**
- Last agent alive wins solo.
- If all remaining survivors are mutually allied, a 120-tick countdown starts. If no one betrays in time, the alliance wins together.

## Stack

React 18, TypeScript, Vite, Zustand
