# Boss Factory review checklist

## One-boss stop gate

- [ ] One active benchmark boss is named
- [ ] No additional boss is being designed, generated, rebuilt, or tuned before this boss passes

## Gate 1 — Reference Lock

- [ ] One canonical complete reference pose is path- and hash-locked
- [ ] Every retained structural part derives from or is compared with the reference
- [ ] Asset-usage inventory assigns every accepted frame an explicit use/retain/archive status
- [ ] Palette, binary structural alpha, transparent edges, pixel density, and equal-frame registration pass

## Gate 2 — Neutral-Pose Match

- [ ] Modular neutral screenshot comes from the actual Boss Sandbox
- [ ] Centered, equal-height opacity comparison matches silhouette and visual balance
- [ ] Body, joints, appendages, weapons, reactor, layering, scale, and overlap match the reference
- [ ] Rig/pivot manifest is current and no major part floats

## Gate 3 — Motion-Range Review

- [ ] Contact sheet includes neutral, fully open, fully closed, maximum left/right, firing, strike, charge, phase two, stagger, and death
- [ ] Joints remain connected and layering remains correct throughout the complete range
- [ ] No frame jump, weapon-size drift, unintended nonuniform stretch, or inconsistent pixel density remains

## Gate 4 — Attack-to-Sprite Review

- [ ] Exactly three initial multi-beat core attacks and one anatomy-specific signature are mapped
- [ ] Every attack declares moving parts, sprite animations, sockets, telegraph, connected beats, movement rule, recoil, recovery, and five capture paths
- [ ] Every damaging beat follows its visible anatomy/socket and has a prior locked telegraph
- [ ] No attack could transfer unchanged to another boss without meaningful visual/mechanical changes
- [ ] Phase two visibly transforms and remixes taught mechanics rather than only increasing numbers

## Gate 5 — Actual Gameplay Review

- [ ] Every attack has actual preparation, telegraph, first-beat, peak-danger, and recovery captures
- [ ] Mobile screenshot is captured from real gameplay and visually reviewed
- [ ] Attack/beat/state text is absent from the playfield
- [ ] Aiming/prediction lines, joint/socket guides, bounds, hitboxes, and debug markers default off and are absent
- [ ] Entrance, idle, large hit, stagger, damage, transition, cleanup, and death look intentional in context

## Safety and release

- [ ] Same configuration, seed, viewport, and command replay identically
- [ ] All critical attacks have at least 6 px replayed clearance after 3 px geometry uncertainty in the canonical 390×844 mobile arena
- [ ] Spawn/reset/replay/loop/state controls clean up correctly
- [ ] Production exclusion, Director, root, and private Runner gates pass
- [ ] Visual-verification result records reviewer, date, evidence, and Gate 1–5 verdicts
- [ ] Roster classification and benchmark evidence are updated
- [ ] One-boss lock is released only after every item above passes or the user explicitly accepts a documented exception
