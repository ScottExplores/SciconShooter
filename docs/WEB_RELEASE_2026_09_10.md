# Web release — 2026-09-10

Scope: promote the experimental PixiJS web gameplay to main, not the separate
Godot Android app. Keep the production social worker unchanged.

## Device Hangar saves

- Reproduced an older v3 same-Pilot save losing its upgrades: the loader ignored
  retired versions and then deleted their keys. It now migrates the newest
  available same-Pilot save and retains the original version as a recovery copy.
- Reproduced malformed saved data being silently replaced by an empty Hangar.
  Loading now leaves the original bytes intact and reports the read failure.
- Guest purchases now read the latest saved profile, recover any interrupted
  Campaign journal first, and commit the upgrade/Token balance and achievement
  counter through the existing two-key journal before updating React.
- Purchase callbacks no longer perform writes inside React state updaters.
  Storage failures display an actionable error instead of an unsaved upgrade.
- Wallet purchase authorization and cloud settlement are unchanged.

The reporter's exact device/browser sequence was not available. These are
reproduced save-loss paths, not proof of which one their device encountered.
Device saves are still scoped to that browser and site; private browsing,
clearing site data, or changing browsers does not provide cloud recovery.

## Presentation

- The ready signature icon has no READY badge. Cooldown seconds and locked/
  paused states remain, along with the accessible action label.
- Hangar keeps Upgrade and Preview Fire side-by-side without the unused
  Starship/Power summary or duplicate tier row.
- Original opening-mission scenery is restored; Breakwater assets are retained.

## Verification

- Wallet-free UI purchase on the shared experimental preview: RSC Movement
  Speed 2 → 3, 135 → 5 Tokens; after page reload, level 3 and 5 Tokens remained.
- Normal Campaign mission launched. Ready signature button had no status text;
  activating it showed the 16-second cooldown and disabled the button.
- Runtime tests cover all four hulls/all four upgrade tracks, reload, weekly
  rollover, legacy saves, corrupt saves, sequential purchases, interrupted
  mission/purchase journals, unavailable storage, and wallet-profile isolation.
- Production build checks exclude Combat Lab and Director assets/code.

## Supabase check

The game project was ACTIVE_HEALTHY and answered a read-only database query
on 2026-09-10 (21 MB database). The account is still on Free. The reviewed pause
notice concerned the separate Digital Self project, not Scicon Shooter.
No projects were deleted and no billing changes were made.
