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

- **Preset (default)** — 13 named archetypes with fixed trait distributions. Active archetypes can be toggled individually — run any subset of 2 or more.
- **Random** — traits are randomized, but every agent's traits always sum to the same total so no agent has an inherent stat advantage.

### Archetypes

Maximizer, Opportunist, Loyalist, Paranoid, Vengeful, Merchant, Expansionist, Coward, Berserker, Manipulator, TitForTat, Chaotic, **Oracle** (maximum intellect, zero irrationality — the closest thing to a perfectly rational agent).

## Traits

Every agent — preset or random — has the same total trait budget, so no archetype has a raw stat advantage.

| Trait | Effect |
|---|---|
| Aggression | Likelihood to attack; chases enemies when no resources are nearby |
| Trust | Willingness to initiate and accept alliances; low-trust agents rarely form alliances at all |
| Loyalty | Resists betrayal; shares resources with weaker allies; rushes to support allies under attack |
| Greed | Prioritises gathering; builds betrayal temptation when an ally has more resources |
| Risk Tolerance | Sets flee and heal HP thresholds; brave agents target stronger enemies; cowards bail early |
| Memory | Vision radius (3–6 tiles); high-memory agents retain trust/resentment longer and recall resource locations |
| Irrationality | Adds noise to all utility scores; occasionally triggers a fully random action |
| Intellect | Suppresses decision noise; scales threat awareness; vets risky alliance partners; weights resources by value-per-distance |

**Vision** is limited to each agent's memory-derived radius. Allied agents share vision — each ally's field of view is visible to the whole group.

## Mechanics

**Actions:** move, gather, attack, heal, share, offer/accept/reject alliance, support ally, betray ally

**Combat:** adjacent only. Each allied agent standing near the target adds +50% damage. Allies never attack each other. Agents flee when health falls below a risk-tolerance-derived threshold.

**Alliances:** prevent mutual attacks; merge the group's vision; split gathered and looted resources evenly. Betrayal breaks all group bonds simultaneously, steals 35% from the target, and lowers the betrayer's reputation with every other agent. When an agent breaks from an alliance, all former members immediately resent them.

**Death Zone:** a fire ring that starts closing in from the edges at a configurable tick. The closing speed scales with map size so the pressure is consistent regardless of grid dimensions. Agents actively flee toward the center when caught outside. Very greedy agents near the resource win threshold may briefly dash into the zone for a high-value pickup, but bail if health drops below 30.

## Configuration

All options are available in the Configure World panel:

- Grid width and height (default 40×30)
- Agent mode (preset / random) and active archetypes
- Resource and obstacle density
- Death Zone start tick — lower values create earlier pressure (default 1500)

## Winning

- First agent to accumulate 100 resources wins.
- Last agent alive wins if no one reaches the threshold.
- If all survivors are mutually allied for 60 ticks without betrayal, the alliance wins together.
- If all agents die simultaneously, no winner is declared.

## Stack

React 18, TypeScript, Vite, Zustand
