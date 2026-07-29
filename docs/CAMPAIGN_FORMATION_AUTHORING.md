# Campaign formation authoring contract

Revision 23 treats `game-config/campaign.json` as the authoritative Campaign schedule. A grouped spawn is any spawn whose pattern is not a loose `single-*` or `*random*` pattern. Every grouped spawn must resolve to exactly one pack explicitly listed by its Wave.

## Normalized inventory

- 386 grouped spawn events resolve successfully.
- 386 grouped spawn events have an explicit role-compatible pack binding.
- 251 internal Waves use one or more of the 11 formation packs.
- Zero grouped spawns are undeclared or ambiguously declared.
- Zero declared packs are unused by their Wave.
- Zero authored role uses violate `reuseCooldownWaves`.

The normalization repaired 30 previously unbound rows: 28 short major-boss lead-ins that deliberately cleared their declarations during cloning, plus two Paywall Siege rows that declared Citation Spiral while spawning Jet Scout and Jet Interceptor roles. `pack-light-jet-pincer` now represents that early two-role encounter without pulling the Mission 4 Jet Heavy role into the Mission 3 checkpoint.

Twelve role cooldowns previously contradicted intentional adjacent-Wave reuse. Their values are now zero, meaning those formation staples are deliberately repeatable. Five specialist/reserved roles retain nonzero cooldown metadata because their authored Mission schedules do not violate it. Browser and Director validation reject future cooldown contradictions instead of letting runtime suppression remove required enemies or deadlock a clear condition.

## Reproducible authoring

`tools/campaign-formation-authoring.mjs` owns the deterministic normalization pass. It:

1. Ensures the exact light-jet pack and reverse role compatibility exist.
2. Resolves final spawn roles and shapes after cloning and early-role fallback.
3. Replaces each Wave declaration with only the packs its grouped spawns use.
4. Lowers only cooldown values that contradict the preserved authored Wave sequence.
5. Leaves Mission IDs, graph nodes, edges, routes, map positions, event timing, and enemy choreography unchanged.

`tools/author-campaign-graph-v23.mjs` invokes the pass at the final authoring boundary. `tools/normalize-campaign-formations-v23.mjs` applies the same pass to an existing revision-23 package. The operation is idempotent.

Runtime pack admission still uses the explicit Wave declaration plus role compatibility. Maximum simultaneous instances and post-retirement recovery continue to be enforced by `services/campaignFormationBudget.ts`; the normalized schedule makes role cooldown metadata truthful at authoring and validation time.
