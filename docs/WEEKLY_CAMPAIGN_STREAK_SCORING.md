# Weekly Campaign Streak: Persistence and Score Model

## Purpose and separation from Campaign rewards

Weekly Streak is a forward-only scored run through the authored Campaign graph. It is a weekly competition record, not a second Campaign reward settlement.

- Weekly points never grant Campaign coins.
- Weekly three-star-quality points may be earned again even when permanent Campaign stars already exist.
- Permanent star coins, first-clear coins, mastery rewards, replay rewards, and one-time Supply Drop rewards remain in their existing Campaign settlement paths.
- A Weekly Streak score is ready for leaderboard submission only after the streak is finalized.

The domain implementation is `services/weeklyCampaignStreak.ts`. It does not submit a leaderboard record itself; it produces a canonical finalized score state for the existing submission boundary.

## Persistent state

Schema version 1 stores:

- `weeklyId` and `resetAtMs`, which prevent a stale streak from entering another weekly competition.
- `startNodeId` and `currentNodeId`.
- Ordered direct-edge `committedRoutes`, including edge, source, target, route, risk, and commit time.
- Ordered `visitedNodeIds` and duplicate-safe `scoredNodeIds`.
- One canonical score event per completed node, including the observed outcome and recomputed breakdown.
- Aggregate score categories and total points.
- Active/finalized state, finalization reason, finalization time, trigger node, and submission status.
- Revision and timestamps for stale-confirmation and persistence checks.

Sanitization never trusts a stored aggregate total. It rebuilds the connected route from authored edge IDs, removes duplicate events, accepts only a scored prefix of the visited route, and recalculates every category. A weekly-ID/reset mismatch or an invalid route is rejected.

The migration helper accepts schema-version-1 records and conservative legacy aliases such as `weekId`, `weeklyResetAtMs`, `startMissionId`, `currentMissionId`, `chosenRoutes`, and `events`. Numeric legacy totals without canonical node events are not imported as trusted score.

The merge helper is monotonic:

- A finalized copy wins over an active descendant, so sync cannot resume an ended streak.
- Compatible active prefix copies select the farther connected copy.
- Divergent local/wallet branches are reduced to their common prefix and finalized with `merge-conflict`.
- Divergent routes are never unioned, because that would manufacture a sibling-route teleport and duplicate score.

## Starting and traversal rules

A player may start at any node that is both unlocked and `weeklyStreakEligible`. Starting at the graph entry offers the longest ceiling, while a later unlocked node offers a shorter attempt.

After start:

1. The current Mission must finish and score before movement.
2. The next node must be the target of a direct authored outgoing edge.
3. Target prerequisites must be met and the target must be Weekly-eligible.
4. The direct edge is appended to the binding route commitment.
5. Each node may enter `scoredNodeIds` only once.

Selecting the current node again, an earlier/visited node, a sibling route, a skipped future node, or an unrelated node does not mutate the streak. It returns a revision-bound confirmation object. Confirming that object finalizes the streak as `repeat-selection`, `backward-selection`, or `disconnected-selection`. The confirmation becomes stale after any state revision.

Loss and deliberate end finalize immediately. A terminal node finalizes only after that node has scored. Crossing `resetAtMs` finalizes an otherwise-active persisted streak as `weekly-reset`.

## Score coefficients

| Component | Points |
| --- | ---: |
| Regular enemy | 12 each |
| Elite enemy | 45 each |
| Wave clear | 150 each |
| Mission clear | 650 |
| Mini-boss | 500 each |
| Major boss | 1,600 each |
| No damage | 300 |
| Accuracy at least 90% | 200 |
| Accuracy at least 75% | 100 |
| At or under authored par time | 150 |
| At or under 120% of par time | 75 |
| Three-star-quality clear | 400 |
| Remaining life | 20 each, capped at 10 lives |

Accuracy and time bonuses use only the highest applicable band. Three-star quality is an observed Weekly performance result and does not read or re-award the permanent Campaign star grant.

### Route-risk multiplier

After base points are added, the route multiplier is:

`risk multiplier × authored edge weekly multiplier × node weekly multiplier`

Risk multipliers are:

- Low: `1.00`
- Moderate: `1.05`
- High: `1.10`

Authored edge and node multipliers cannot reduce the score below `1.00`, and the combined route multiplier is capped at `1.50`. The start node has no incoming route multiplier.

### Consecutive-Mission multiplier

After the route adjustment, the uninterrupted completion multiplier is:

`1 + min(previously scored nodes × 0.015, 0.15)`

This starts at `1.00`, adds 1.5% for each already-scored node, and caps at `1.15`. It rewards long runs without making a late start invalid or allowing repeated nodes to build a multiplier.

### Final formula

For one node:

1. `base = combat + clears + bosses + performance + remaining lives`
2. `afterRoute = round(base × routeMultiplier)`
3. `nodeTotal = round(afterRoute × consecutiveMultiplier)`
4. `routeBonus = afterRoute - base`
5. `consecutiveBonus = nodeTotal - afterRoute`

The streak total is the sum of the canonical node totals. No part of this formula returns or settles coins.

## Deterministic branch-balance simulation

The focused test suite evaluates both a synthetic fork and every fork in the authored ten-sector graph.

For each authored fork it identifies the lower-ceiling route and higher-ceiling combat route from the direct edge risk and authored multipliers, then runs two deterministic profiles across `fork -> route -> explicit rejoin`:

1. **Preservation profile:** the safer route is cleared at three-star quality with no damage, 95% accuracy, par time, and ten lives. The combat route is completed with heavy damage, one life, 55% accuracy, slow time, and one-star quality. The safer route must score higher.
2. **Mastery profile:** both routes are cleared cleanly, while the combat route includes three elites and one mini-boss. The combat route must score higher.

At the current authored weights, all ten route forks pass both comparisons. A representative sector produces:

- Clean safer path: approximately **8,574** points.
- Badly damaged combat path: approximately **7,908** points.
- Mastered combat path: approximately **10,614** points.

This proves there is no universally dominant selection under the modeled performance outcomes: the high-risk path has the higher ceiling, but its multiplier does not guarantee a win after a poor clear. The test is intentionally graph-driven so a future authored multiplier or route change that removes this tradeoff fails visibly.

## Integrity boundary

This service protects local domain invariants and merge consistency; it does not make browser simulation server-authoritative. A Weekly launch now receives a server-signed `run-start` token bound to `weekly-streak` mode and to the exact active streak prefix at launch. That binding includes the current week/reset, start/current node, creation time, revision, visited/route/score-event counts, accumulated scored duration, and a canonical HMAC-protected prefix digest. A resumed streak must preserve that prefix exactly and extend it only with routes and score events after the server bind time; the final revision must account for every new route, score event, and finalization.

Finalization must include the finalized graph proof; the server rejects a Weekly token with no proof and rejects a standard token carrying Weekly proof. Validation enforces graph-connected authored edges, prerequisites, forward-only unique nodes/edges/events, strict timestamp ordering, source scoring before route commitment, score after the incoming commitment, current week/reset binding, and an allowlisted finalization. It also recomputes the canonical score with Campaign coins fixed at zero, requires exact authored Wave and boss counts, bounds non-boss/elite aggregates against authored encounter budgets, requires at least 80% of authored clear-after-duration time, and compares only the post-start-prefix mission time with server-measured run time plus bounded latency tolerance.

Guest starts remain signature-free and carry only an HMAC digest of their local Pilot identity. If an authenticated wallet session is already present, the run is bound to that wallet/profile and must finish under the same session; starting a guest run never prompts for wallet authorization. Finalized local state is only marked `ready` for submission, not silently treated as a verified leaderboard record.

Route choices and combat outcomes remain client-attested rather than witnessed through an authoritative server simulation. A stolen guest device profile is not a cryptographic identity, and legacy receipts reissued from the current database schema may not contain the newer identity/prefix summary fields. The checks reject disconnected or rewritten histories and impossible aggregates, but they are practical integrity hardening rather than tournament-grade anti-cheat.
