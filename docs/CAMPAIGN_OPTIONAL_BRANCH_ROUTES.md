# Campaign Optional Branch Routes

This document records the authored optional mastery routes that extend the completed Mission 5 Bastion Present Drop subsystem. These routes are Campaign-only, never advance the main checkpoint, never mutate weekly state, and use the existing GameEngine event renderer.

## Preserved subsystem

- Branch: `branch-bastion-research-supply`
- Source: `stage-bastion-protocol`
- Mission: `present-drop-bastion-supply-01`
- Type: `present-drop`
- Reward: 120 fixed coins plus up to 257 verified present coins (377 maximum)
- Settlement: one-time, signed wallet-bound attempts, retry after failure, duplicate-safe

The original definition has a regression hash in `tests/campaignBranchExpansion.test.cjs`. Editing its IDs, authored targets, timing, or reward envelope must be treated as a migration, not a routine branch-content change.

## Additional authored routes

| Sector | Three-star source | Branch | Mission type | Playable identity | Fixed one-time reward |
| --- | --- | --- | --- | --- | ---: |
| 2 | `stage-null-sector` | `branch-null-helix-formation` | `formation-challenge` | Three readable formation transformations: pincer, spiral, and diamond | 210 |
| 3 | `stage-ion-citadel` | `branch-ion-support-relay` | `support-trial` | Shield and magnet support links around an asteroid screen and two escort formations | 260 |
| 4 | `stage-terminus-ascendant` | `branch-terminus-elite-remix` | `elite-remix` | Three all-elite command cells with bounded authored patterns | 330 |

No route introduces a boss or mini-boss. This keeps the optional branches compatible with the active Gatekeeper one-boss runtime lock and avoids duplicating Boss Factory definitions.

## Runtime contract

`buildCampaignBranchRuntimeCampaign(sourceCampaign, branch)` adapts a branch into one canonical GameEngine Mission with one authored wave. It does not create another renderer or collision system. Combat branch events are cloned before launch, so runtime mutation cannot rewrite `campaign.json`.

Callers must discriminate the branch before reward verification:

- `verifyPresentDropRuntimeResult(...)` clamps destroyed-present counts and collected present coins to the authored Present Drop ceiling.
- `verifyCampaignCombatBranchRuntimeResult(...)` grants only `baseCoins + oneTimeBonusCoins` when `stageComplete === true`. Failure grants zero. Client score, pickups, and claimed objective counts never increase this envelope.

The shared progression boundary remains:

1. Reconcile the source Mission's persistent three-star record.
2. Launch only when `canLaunchCampaignBranch(...)` is true.
3. Record failure or interruption with zero reward; a fresh attempt remains allowed.
4. Record success with a stable attempt ID and durable reward receipt ID.
5. Award the verifier's exact total through `settleCampaignBranchAttempt(...)`.
6. Keep a claimed node visible; `getCampaignBranchNodeState(...)` returns `claimed` and `canLaunchCampaignBranch(...)` returns false.

## Integration invariants

- Main Campaign checkpoint and internal-wave checkpoint are unchanged by branch launch, failure, or success.
- Weekly score, checkpoint, lives, coins, and reset state are untouched.
- Every reward is one-time and idempotent.
- A failed or interrupted attempt never marks the route completed.
- Connected-wallet combat settlement must use the same server-authoritative fixed reward envelope; it must not reuse Present Drop counts or accept a client-provided coin total.
- Branch labels and reward previews may be presented in the Campaign Map, but claimed nodes remain visible and nonlaunchable.

## Adding another combat route

Add data to `game-config/campaign.json`, reference the branch from its sector's `branchIds`, and use an existing GameEngine event kind. The browser and Director validators require:

- a supported kind (`formation-challenge`, `support-trial`, or `elite-remix`);
- exactly three-star mastery of its source Mission;
- ordered events that finish inside the authored duration;
- real enemy-role and sprite references;
- a combat budget at least as large as weighted authored threat;
- no boss events and no Present Drop bonus targets;
- at least two formation patterns for a formation challenge;
- at least one enabled power-up event for a support trial;
- only elite-ranked spawn entries for an elite remix.

Update the expansion tests whenever a new type or reward contract is introduced.
