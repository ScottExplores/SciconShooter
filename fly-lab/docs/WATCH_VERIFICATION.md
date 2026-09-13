# Watch display verification

This is verification of a spectator interface and replay tooling. It is not evidence of learned fly gameplay.

## Recorded demonstration

Run `20260913T054240-3a03fbc8` was recorded from source commit `432daff4` using the canonical ORBIT ENTRY mission, random movement, constant fire and local Intel D3D11 rendering. It contains 600 decisions / 30 simulated seconds. The display movie contains the initial frame plus 600 resulting frames, lasting 30.05 seconds at 20 fps.

The cache builder reproduced all state, grayscale observation, exact PNG, event and runtime/asset hashes before encoding H.264 Constrained Baseline / yuv420p. The video is a 4,046,564-byte lossy display derivative; original scientific records remain immutable in the experiment export. Video SHA256: `70c6556c4b13aa4768e571b59acd48dce9a364fb79fb94f118249b14173d660f`.

The user's previously paused run `20260913T050933-178c1553` was finalized at decision 242 / score 84 before the coordinator restart. It was not reset or discarded. Creating the display demo used a separate coordinator.

## Software checks

- 112 Python tests passed, including 11 new watch tests: source/export rejection, state and pixel mismatch rejection, cancellation, cached reads starting no engine, file integrity, byte ranges and consistent live snapshots. Four additional portable-server tests passed (116 total): startup integrity, file boundaries, compression, ranges, HEAD/ETag and read-only HTTP methods. Existing Brian2/pyparsing deprecation warnings remain.
- All 13 real-engine/asset tests passed: deterministic simulation, native inputs, independent observer/cosmetic behavior, fresh resets and strict assets.
- Root and lab TypeScript passed. Changed frontend files passed ESLint.
- Lab build and a fresh canonical production build passed. The production exclusion check found no Fly Lab/Director files or markers. Existing bundle-size/vendor warnings remain.
- Actual HTTP video request `Range: bytes=0-1023` returned 206 and exactly 1,024 bytes with the correct total length.
- Independent source-coordinate audit matched all 43,864 displayed soma IDs, locations and classes against the official annotation Feather. Deterministic regeneration reproduced anatomy asset SHA256 `149535ab98fb1f5f2c07641583e995b32b36da115ae55f07d05c3913c761e638`.

## Browser checks

Playwright was used because the named Browser testing plugin was unavailable. Real Chromium loaded the actual local application; no stock game images or fabricated activity were used.

Desktop at 1440×960 passed autoplay, pause stability, repeated current-mode selection, seeking against the real recorded timeline, fullscreen, loop wrap and stopping at the end with looping disabled. At 12.5 seconds, displayed decision 250 matched the recorded score 85, southwest command and firing flag. A simulated visibility event paused playback and resumed only a previously playing video. The low-power anatomy image stayed byte-identical between captures.

Passive playback made no POST requests and never fetched the dense research `/status` endpoint. Live remained read-only in standby. Research tab navigation retained an edited seed. A deliberately failed manifest request recovered through Retry without creating a new simulation. No uncaught page errors occurred.

Mobile at 390×844 had no horizontal overflow; the anatomy rendered correctly when scrolled into view. Offscreen anatomy deliberately stops drawing, so a full-page screenshot taken without scrolling is not evidence that the offscreen panel failed.

## Visual comparison to the requested direction

1. The portrait game remains the primary viewing area, with only score, lives and simulated time underneath.
2. The large right-hand anatomical panel and small grayscale inset follow the concept. Actual complete source coordinates replace the concept's illustrative brain shape.
3. The compass, clear movement words, firing dot and real three-second path preserve the reference's visible movement without inventing neural activity.
4. Thin dark borders, cyan accents, warm firing highlights and restrained typography preserve the visual hierarchy.
5. One bottom transport strip replaces the dense research controls. Mobile stacks game, movement and anatomy; technical controls remain a separate view.

## Limits

Portable display behavior is tested on this Windows computer; Raspberry Pi hardware has not been connected or benchmarked. The baseline recording is explicitly random. The current MaleCNS candidate still fails sensory/decoder gates, and no training or learning claim was enabled by this work. No wallet, leaderboard, funding, proposal, production deployment or normal game entrypoint was changed.

## Portable package check

The separate `watch.html` production bundle passed autoplay, pause, timeline-aligned seeking, full screen, loop/end behavior, low-power still anatomy and mobile layout. It made zero lab API or external requests. It contains only the display entry's transitive assets, the verified replay and its timeline/provenance, and a Python standard-library file server. A generic Windows file server exhibited intermittent Chromium connection resets with large files during QA; the included server fixes transport behavior, compresses text, supports video ranges and refuses corrupt files. The package starts with `python3 serve-watch.py` and binds loopback only.
