# Frontier Crownclaw Boss Factory benchmark

## Boss DNA

Frontier Crownclaw is a low, wide teal/gold/steel bastion crab. Its crown reactor, six-leg crabwalk, two heavy primary claws, rear emitters, winches, and visible chains behave as one mechanical organism. The player reads a real mechanism, survives its opening, then attacks the exposed reactor during recovery.

Helios Clawcarrier is a polish benchmark only. Frontier does not inherit Helios's guns, channel, clamp, mines, timing, or phase grammar.

## Locked pixel art

- Canonical reference SHA-256: `a3c2e6853d192b45d996ee50b3432fd61d20513a2ea468695670d8df5957f4a5`
- Native source neutral: `224 x 192`, 32 colors
- Runtime neutral: `260 x 210`, binary alpha
- Runtime neutral SHA-256: `3fe62b12ade41026f74c334e3272f28261a60c8a0935b003e536bcff9d33e342`
- Atlas: `2048 x 256`, 32 equal frames, binary alpha
- Atlas SHA-256: `8da50a881b5ad2425c294e7b9f382172c7fadbff70b8b52f4d2206d793e980fb`

The runtime art keeps the broad crab silhouette and readable armor clusters while removing overly painted detail. Structural alpha is binary and VFX remain separate.

## Rig and sockets

The accepted `modular-hierarchy-v1` manifest is `director-data/prototype-assets/frontier-crownclaw/frontier-crownclaw.rig.json`.

- 51 parts
- 11 live sockets
- eight registered animations
- rig SHA-256: `00735839641f7c3f4f334c39246b7fabaf23e9df10a3abe202b31a2fb44071e3`

Both claws are authored, handed parts. Launched claws hide their seated copies, preserve visible fixed-size chain units between current hull/claw endpoints, and restore only on reseat. Cancellation, reconstruction, owner loss, and death clean up launched parts and connectors.

## Non-attack lifecycle

Entrance unfolds the legs and seats the claws. Idle gives the crown/reactor registered frame animation and keeps shell, legs, claws, and rear appendages alive with restrained delayed movement. Ordinary damage stays local. Critical Cross-Link persistently opens the crown and mechanisms. Destruction separates claws, armor, and mechanisms before the final cleanup.

## Combat sentences

Frontier has exactly three core attacks:

1. **Chainclaw Harpoon** — read one committed claw target, dodge the visible launched claw, then cross behind retraction before the related second strike.
2. **Crown Reactor Beam** — read the crown pulses, occupy the unlit region, and cross behind the controlled beam shift.
3. **Bastion Crabwalk Barrage** — read travel direction, live rear emitter, and the missing slot in serialized formations while accounting for the moving shell.

**Crown Cross-Link** is the separate signature. Two nonparallel live tethers create a rotating hinged opening; the player follows the opening rather than surviving a generic parallel corridor.

## Critical Cross-Link

Phase two visibly exposes the reactor, opens winch housings, rotates rear anatomy, changes claw posture, and reveals cross-link braces. It remixes commitment depth, reactor reversal, traversal range, and tether timing without replacing the learned rules with only speed or density.

## Route matrix

- Intact evidence: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-safe-route-evidence.json`
- Intact witnesses: 28/28
- Component-fallback evidence: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-component-fallback-safe-route-evidence.json`
- Component-fallback witnesses: 48/48
- Total retained witnesses: 76/76
- Coverage: mobile `390 x 844`, desktop `1280 x 720`, both phases where applicable, two bounded seeds, every intact branch, port-only/starboard-only Harpoon and Cross-Link, and both zero-claw parity substitutions
- Standard uncertainty: 3 px
- Required post-uncertainty clearance: 6 px
- Minimum measured clearance: `6.77702596335363 px`

The trace proof compiles the actual Frontier timeline, exercises the implemented Frontier hazard samplers, and resolves registered rig sockets. It does not directly instantiate the private `GameEngine`; actual canonical-browser review is the final presentation/collision gate.

## Actual visual evidence

- Neutral: `director-data/prototype-assets/frontier-crownclaw/evidence/modular-neutral.png`
- Neutral/reference overlay: `director-data/prototype-assets/frontier-crownclaw/evidence/neutral-reference-overlay.png`
- Labeled 11-pose review: `director-data/prototype-assets/frontier-crownclaw/evidence/key-pose-contact-sheet.png`
- Clean mobile play: `director-data/prototype-assets/frontier-crownclaw/evidence/mobile-gameplay.png`
- Desktop runtime: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-desktop-runtime.png`
- Desktop attacks: four representative captures under `director-data/prototype-assets/frontier-crownclaw/evidence/desktop/`
- Phase two: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-mobile-critical-neutral.png`
- Destruction: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-destruction-peak.png`
- Attack stages: 20 reviewed PNGs under `director-data/prototype-assets/frontier-crownclaw/evidence/attacks/`

The actual browser pass found and corrected a missing alpha-mask registration, an entry-state manual-attack fallback, a duplicate reactor beam, and the upward-authored crown bolt's velocity-orientation offset. It also replaced the prior neutral placeholder, added the required 11-pose sheet, and retained one desktop capture per attack. Focused real-GameEngine regressions now lock manual playback and destroyed-claw behavior.

## Automated evidence

- Final focused Frontier suite: 70/70 passed
- Root TypeScript check: passed
- Director TypeScript check: passed
- Manual Attack 2 entry regression: passed
- Intact route matrix: 28/28 passed
- Component-fallback route matrix: 48/48 passed
- Browser review: all four attacks at mobile and desktop; phase two, low health, and destruction at mobile
- Root build and production-exclusion check: passed
- Root repository suite: 937/937 passed
- Prepared private Runner: 18/18 tests passed and all three pinned Frontier assets are present; campaign parity is stale (`2343f050...a1656` manifest versus `a4cbd1f7...dc924` current)
- Full Director suite: 274/280 passed; five stale campaign-assumption fixtures and one generic all-primitives fixture remain outside the Frontier lock. The latter is correctly rejected because Frontier primitives are restricted to the Frontier Sandbox event.
- Repository publication: not performed; the stale Runner snapshot was not rebuilt or deployed

See `director-data/prototype-assets/frontier-crownclaw/evidence/visual-verification.md` for the complete gate record.

## Reusable lessons

1. A launched body part needs a visible connection or return mechanism, live sockets at both ends, fixed-size connector units, and exhaustive cleanup.
2. A boss needs an explicit non-attack animation pass; focal frame animation and secondary anatomy motion make it feel alive between attacks.
3. Manual attack controls must override entry safely and prove the selected sentence through warning and fire.
4. The world-space runtime owns damaging beam presentation; rig-local decorative duplicates create misleading collision.
5. A boss-specific signature may reuse shared socket, lifecycle, and proof primitives without becoming a generic choreography template.
6. Destructible anatomy needs both immediate hidden-emission cleanup and a separately proven route matrix for every retained fallback.
7. A tuning panel may expose bounded schema-v1 proxies, but only the reset/default configuration inherits route proof; edited drafts must be rehashed and re-proven.

## Disposition

Frontier Crownclaw is Factory-ready and Sandbox-only. This Frontier package does not add it to a Mission, campaign, progression, production deployment, or public release. The surrounding worktree contains unrelated campaign changes that remain outside this benchmark. Any later change to its timeline, sockets, collision, art, component rules, viewport, movement geometry, or tuning defaults must refresh both route matrices, focused playback/pose/component tests, hashes, and actual mobile/desktop review.
