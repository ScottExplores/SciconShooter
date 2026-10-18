# Round 1 critique (merged A–F, headless mobile 390×844 + 360×640)

Evidence: /workspace/scicon-revamp/qa/BEFORE (baseline), /workspace/scicon-revamp/qa/AFTER-r1, /workspace/scicon-revamp/qa/R1-merged, /workspace/scicon-revamp/qa/R1-boss.

## Gaps vs Galaxiga / Galaxy Attack / Sky Force Reloaded
1. **Mission 1 is empty.** Only ~17 kills in 57 s (baseline had 64 in 1:53); max 3 enemy bullets on screen. Galaxiga's first stage fills the top half with a 30–40 ship Galaga formation that flies in on curves, settles, breathes, then peels off into dives. Opening must be dense, readable and exciting, with easy bullets.
2. **Hit flash whitewashes the whole boss/mini-boss** for long stretches (solid white silhouette in many frames). Use a 1–2 frame partial tint (≤60 ms, ~45% additive), throttled, plus small sparks at the hit point.
3. **Tutorial hint boxes sit in the middle of the playfield** and overlap enemies and the boss (even in boss waves). Show at most one hint at a time, only in Mission 1, in a slim strip just above the player HUD, auto-dismiss after ~3 s or on first input.
4. **Projectile readability:** player shots are thin; enemy shots are small pink dots. Need chunky glowing player bolts (per ship colour) and high-contrast enemy bullets (bright core + dark outline + soft glow) that read over nebula/planets.
5. **Backgrounds compete with action:** huge saturated planets and nebula at full brightness. Dim/desaturate the far layer (~35–45%), add parallax, keep the play lane clean.
6. **Wing ships are tiny** and static; make them ~70–80% of the player ship's visual size, with idle bob, thruster flicker, muzzle flashes.
7. **Home screen regression:** title/logo gone, hero ship cropped at the top, Weekly Funding card text clipped on the right ("PRIZE P", "1,000 R") and overlapped by the Daily Gift tab.
8. **Win screen is unchanged and still overflows:** stat labels (ENEMIES / FLIGHT) collide with the frame on 360-wide phones; the big ring graphic in the middle is empty dead space; no medals/reward reveal visible; nothing animates (count-up, stars, confetti, reward cards).
9. **Static UI everywhere**: menus, buttons, title and transitions are static. Scott wants everything animated, crisp pixel art (pixel-perfect scaling, pixel fonts where readable).
10. **Performance:** median 16–20 FPS in headless SwiftShader (baseline 10–14). Not a device measurement, but there is clearly per-frame waste; target ≥30 in the harness.
11. **Legacy test suite:** `node --test tests/*.test.cjs` went from 44 failing (baseline remaster) to 240 failing after the merge. Includes wallet/leaderboard/weekly security tests. Must be reconciled.
