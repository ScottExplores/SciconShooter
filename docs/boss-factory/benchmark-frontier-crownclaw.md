# Frontier Crownclaw Boss Factory benchmark

## Boss DNA

Frontier Crownclaw is a low, wide teal/gold/steel bastion crab. Its crown reactor, six-leg crabwalk, two heavy primary claws, rear emitters, winches, and visible chains behave as one mechanical organism. The player reads a real mechanism, survives its opening, then attacks the exposed reactor during recovery.

Helios Clawcarrier is a polish benchmark only. Frontier does not inherit Helios's guns, channel, clamp, mines, timing, or phase grammar.

V0.26 is a mobile-only Factory amendment under the one-boss lock. Its changed claw, tether collision, beam art, and deep target geometry now pass regenerated canonical-mobile route proof, focused type/build gates, owner-only Runner parity, and Sites deployment. Wide-host review confirms the fixed portrait arena and requested Harpoon/Beam presentation. Factory-ready status remains withheld until phone-width review and the complete current capture set pass.

V0.27 corrects only Critical Cross-Link's Crown Reactor Beam. It restores the
original wide `0.11π` relay spacing and `0.21π` sweep half-range while removing
the middle beam. Critical fire now has exactly two full-length animated beams;
its warning has four matching start/end rails. The exact mobile `GameEngine`
playback measures a `61.87 px` conservative safe lane, and the regenerated
analytic matrices pass 28/28 intact plus 48/48 component-fallback witnesses
with a minimum `6.012001051 px` clearance after `3 px` uncertainty.

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

Both claws are authored, handed parts. V0.26 uses the registered `claw.open` frame for each launched claw at the same apparent scale as its seated counterpart and repeats the registered `chain.segment` frame between current hull/claw endpoints. Launched claws hide their seated copies and restore only on reseat. Cancellation, reconstruction, owner loss, and death clean up launched parts and connectors.

## Non-attack lifecycle

Entrance unfolds the legs and seats the claws. Idle gives the crown/reactor registered frame animation and keeps shell, legs, claws, and rear appendages alive with restrained delayed movement. Ordinary damage stays local. Critical Cross-Link persistently opens the crown and mechanisms. Destruction separates claws, armor, and mechanisms before the final cleanup.

## Combat sentences

Frontier has exactly three core attacks:

1. **Chainclaw Harpoon** — read the warning-locked ship position, dodge the full-size open claw as it travels deep toward that row, respect the chain during its latched/tensioned damage window, then cross behind non-damaging retraction before the related second strike.
2. **Crown Reactor Beam** — read the crown pulses and registered `beam.0` through `beam.3` active sequence, occupy the unlit region, and cross behind the controlled beam shift.
3. **Bastion Crabwalk Barrage** — read travel direction, live rear emitter, and the missing slot in serialized formations while accounting for the moving shell.

**Crown Cross-Link** is the separate signature. Two nonparallel live tethers create a rotating hinged opening; the player follows the opening rather than surviving a generic parallel corridor.

## Critical Cross-Link

Phase two visibly exposes the reactor, opens winch housings, rotates rear anatomy, changes claw posture, and reveals cross-link braces. It remixes commitment depth, reactor reversal, traversal range, and tether timing without replacing the learned rules with only speed or density.

## V0.26 canonical-mobile route matrix

- Intact evidence: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-safe-route-evidence.json`
- Intact witnesses: 28/28
- Component-fallback evidence: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-component-fallback-safe-route-evidence.json`
- Component-fallback witnesses: 48/48
- Total retained witnesses: 76/76
- Current coverage: canonical mobile `390 x 844`, both phases where applicable, two bounded seeds, every intact branch, port-only/starboard-only Harpoon and Cross-Link, and both zero-claw parity substitutions
- Standard uncertainty: 3 px
- Required post-uncertainty clearance: 6 px
- Minimum measured clearance: `6.77702596335363 px`

The regenerated trace proof compiles the current V0.26 Frontier timeline, resolves registered rig sockets, models the full-size launched claw as an oriented box, gives damaging chain segments a `6.5 px` radius, follows the deeper warning-locked ship row, and applies the standard `3 px` uncertainty. All 76 witnesses retain at least `6 px` post-uncertainty clearance; the minimum remains `6.77702596335363 px`. Historical desktop evidence is retained only as an archival/internal diagnostic and is not a product gameplay mode or current acceptance viewport. Owner-only Sites review confirms wide-host letterboxing around the identical `390 x 844` arena; phone-width review and the complete current capture set remain pending.

## Actual visual evidence

- Neutral: `director-data/prototype-assets/frontier-crownclaw/evidence/modular-neutral.png`
- Neutral/reference overlay: `director-data/prototype-assets/frontier-crownclaw/evidence/neutral-reference-overlay.png`
- Labeled 11-pose review: `director-data/prototype-assets/frontier-crownclaw/evidence/key-pose-contact-sheet.png`
- Historical clean mobile play: `director-data/prototype-assets/frontier-crownclaw/evidence/mobile-gameplay.png`
- Historical desktop runtime and attack captures are retained for provenance only; desktop is no longer a gameplay mode or current acceptance viewport
- Phase two: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-mobile-critical-neutral.png`
- Destruction: `director-data/prototype-assets/frontier-crownclaw/evidence/frontier-crownclaw-destruction-peak.png`
- Attack stages: 20 reviewed PNGs under `director-data/prototype-assets/frontier-crownclaw/evidence/attacks/`

The historical browser pass found and corrected a missing alpha-mask registration, an entry-state manual-attack fallback, a duplicate reactor beam, and the upward-authored crown bolt's velocity-orientation offset. It also replaced the prior neutral placeholder and added the required 11-pose sheet. V0.26 live Sites review confirms the full-size open claw, repeated visible chain segments reaching the ship row, native reactor-beam presentation, wide-host portrait geometry, Restart recovery, and phase-aware numbered controls. Phone-width inspection, direct live collision inspection, and the complete five-stage capture set remain pending.

## V0.26 automated evidence

- Focused verification groups: 23/23, 63/63, and 10/10 passed
- Root TypeScript check: passed
- Director TypeScript check: passed
- Intact canonical-mobile route matrix: 28/28 passed
- Component-fallback canonical-mobile route matrix: 48/48 passed
- Root production build and production-exclusion check: passed
- Current actual-gameplay capture and portrait review: requested Harpoon/Beam plus wide-host portrait passed; phone-width and complete five-stage set pending
- Current Runner parity: passed; 18/18 hosted tests plus live phase-aware controls and Restart verification
- Private deployment verification: passed; owner-only Sites version 33

See `director-data/prototype-assets/frontier-crownclaw/evidence/visual-verification.md` for the complete gate record.

The route, focused-test, typecheck, production-build, Runner, and deployment results above are current V0.26 evidence. They do not substitute for the remaining phone-width inspection or complete five-stage capture set.

## Reusable lessons

1. A launched body part needs a visible connection or return mechanism, live sockets at both ends, fixed-size connector units, and exhaustive cleanup.
2. A boss needs an explicit non-attack animation pass; focal frame animation and secondary anatomy motion make it feel alive between attacks.
3. Manual attack controls must override entry safely and prove the selected sentence through warning and fire.
4. The world-space runtime owns damaging beam presentation; rig-local decorative duplicates create misleading collision.
5. A boss-specific signature may reuse shared socket, lifecycle, and proof primitives without becoming a generic choreography template.
6. Destructible anatomy needs both immediate hidden-emission cleanup and a separately proven route matrix for every retained fallback.
7. A tuning panel may expose bounded schema-v1 proxies, but only the reset/default configuration inherits route proof; edited drafts must be rehashed and re-proven.

## Disposition

Frontier Crownclaw V0.26 is Factory-compatible, Sandbox-only, and listed under **Test Bosses** while its one-boss lock is active. The picker exposes only **Main Game** and **Test Bosses**; internal legacy or rebuild labels never create another user-facing category. This package does not add Frontier to a Mission, campaign, progression, or public release. The canonical-mobile intact/fallback route matrix, focused verification, Root/Director typechecks, production build/exclusion, wide-host portrait review, Runner parity, and owner-only Sites deployment pass. Restore Factory-ready status only after phone-width review and the complete current capture set pass.
