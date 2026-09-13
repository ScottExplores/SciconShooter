# Watch display and Raspberry Pi

Open http://127.0.0.1:5180/#watch for the simple display. Research controls remain at `#live` and keep their existing functions.

## What the display shows

- The actual Scicon Shooter recording, synchronized to the action that produced each frame.
- A movement compass, firing command, and the ship's actual recent positions.
- A sampled anatomical preview: 43,864 unchanged MaleCNS cell-body coordinates from 139,662 available soma locations, with two genuine neuronal tracts. Camera motion is visual presentation; colors are anatomical classes, not firing activity.
- A grayscale preview of the displayed video. This is not the scientific sensory observation, which remains in the experiment export.

The current demonstration is a random baseline with constant fire. It is labeled accordingly. Learning has not been demonstrated, and the failed candidate sensory gates remain closed.

Replay has play/pause, seek, looping, full screen and low-power controls. It does not start the game or neural worker. Live uses a compact read-only snapshot of the existing episode; opening Live does not start one. Hidden displays pause video and polling. Low power holds the anatomy camera still and reduces live polling to two updates per second.

When no replay exists, **Create baseline demo** explicitly records up to 30 simulated seconds, then verifies it and makes a video. This one-time operation can take several minutes. Cancel finalizes the partial experiment and stops the owned workers. The currently selected research episode is preserved. Existing runs can be prepared only when their recorded source matches the running software; already verified cached videos remain watchable after subsequent software updates.

## Pi setup

Use the Pi 5 with its fan and case as a display initially. Full neural simulation has not been benchmarked on the Pi and is already far slower than real time on this PC. Continuous training is not needed to preserve saved checkpoints, and ungated training would not establish learning.

The Pi needs Raspberry Pi OS, a screen, a microSD card and a suitable power supply. Raspberry Pi recommends a quality 5V/5A USB-C supply for Pi 5: https://www.raspberrypi.com/products/raspberry-pi-5/. Check what you already have before buying anything.

Create a portable display after a verified recording is ready:

```powershell
cd "C:\Users\scott\Documents\Scicon Shooter\fly-lab"
npm run build
node scripts/export-watch.mjs RUN_ID
```

The command creates a new `runtime/pi-display-RUN_ID` folder and never overwrites an existing directory. Copy that entire folder to the Pi. In a terminal inside the copied folder:

```sh
python3 serve-watch.py
```

Open `http://127.0.0.1:8080/watch.html` in Chromium and press F11. Low power starts enabled. For kiosk mode, launch `chromium --kiosk http://127.0.0.1:8080/watch.html` from the Pi desktop terminal; some older images call the executable `chromium-browser`. Leave the file-server terminal open. Ctrl+C stops it.

The package contains all its display assets and needs neither the PC nor internet. It serves static local files and provides no experiment-control or wallet API. Its movie is a lossy H.264 derivative; source frame/state/action/asset hashes were checked before encoding. Original provenance and portable checksums are included. Automatic startup and a read-only live PC-to-Pi bridge are possible follow-ups after the actual device is connected and tested. Do not expose the current coordinator's mutation API to the LAN for a display.

## Future fly profile

A clearly labeled exhibition profile is a reasonable next product step once the controller is useful. Keep its model/checkpoint identity and achievements visible. Scott can choose upgrades and research proposals; a numeric action decoder does not imply understanding a proposal.

A wallet, real rewards and ranked weekly participation require their own integration and explicit bot eligibility. Current weekly entry and proposal selection use server-verified runs, receipts and wallet authorization. No wallet, public profile, ranked submission, upgrade purchase or proposal choice is created by this display. An exhibition/bot category should be decided before joining the human leaderboard.

## Implementation boundaries

`Watch.tsx` mounts independently of the research dashboard, so playback does not keep its large `/status` polling loop alive. Anatomical rendering is capped, stops when hidden/offscreen, and uses stable component props. The standalone `watch.html` entry can be exported with just its transitive build assets. The canonical production entrypoint never imports the lab.

`scicon_fly.watch` makes immutable caches under ignored `runtime/watch`. It verifies original export checksums, current source, intercepted asset bytes, engine state, grayscale observations, events and exact PNG bytes before encoding. It serves byte-range video requests, records codec/provenance, and never adds a cache to a failed or cancelled build. Read-only live snapshots bind the recorded action to the exact completed game frame, independently of any command in flight.
