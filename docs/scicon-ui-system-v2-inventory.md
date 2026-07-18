# Scicon UI System v2 Inventory

This inventory maps the current React/Pixi product surfaces to one reusable
visual system. Artwork contains blank safe zones; React owns text, values,
localization, accessibility, and application state. Pixi owns frame-driven HUD
presentation without changing simulation or collision rules.

## Theme: Orbital Research Command

- Semi-pixel navy and cobalt machinery with readable silhouettes.
- Cyan energy seams for neutral/navigation states.
- Orange-gold for primary actions and first-place prestige.
- Emerald for funding, confirmation, and verified state.
- Violet for research/science accents and red for danger/error only.
- Repeating construction language: corner clamps, top-center diamond sockets,
  narrow circuit rails, dark inset glass, and restrained bloom.
- Text is never baked into generated artwork. Every frame includes a quiet,
  high-contrast center region for React-rendered content.

## Product surface map

| Surface | Current owner | Required v2 art family |
|---|---|---|
| Home hero and ship carousel | `components/StartScreen.tsx` | Hero frame, carousel cradle, launch control, arrows, navigation tabs |
| Weekly winner feature | `components/StartScreen.tsx` | Animated champion border, live marker, score/wave chips, countdown and allocation plaques |
| Weekly/all-time leaderboards | `components/StartScreen.tsx` | First/second/third podium rows and medals, standard rows, empty/loading states |
| Past funding winners | `components/StartScreen.tsx` | Archive cards, funding-confirmed and selected status treatments |
| Proposal search and selection | `StartScreen` and `WeeklyProposalSelection` | Proposal rows, selected state, search field, progress rail, confirmation controls |
| Trophies, records, and more | `components/StartScreen.tsx` | Achievement cards, mission history rows, market/action cards |
| Feedback and treasury | `components/StartScreen.tsx` | Compact modal, textarea, address field, copy/send controls |
| Gameplay HUD | `components/UIOverlay.tsx` | Lives, flask meter, score/high-score, wave, pause, boss/sector progress, bomb and upgrade slots |
| Pause and owner test controls | `App.tsx` | Pause frame, resume/quit controls, test status tiles |
| Mission result and score submission | `App.tsx` | Result frame, weekly-lead variant, pilot-name input, submit/skip/retry controls |
| About/legal/funding copy | `App.tsx` and `StartScreen` | Long-copy panel, info cards, status strips, external-link controls |
| Mission record and mint preview | `MissionRecordCard` and preview components | Record border, integrity seals, wallet/mint state controls |
| Story transmissions | `components/StoryTransmission.tsx` | Portrait socket, dialogue frame, receiver/scan accents, continue prompt |
| Tutorial | `components/Tutorial.tsx` | Tutorial frame, instruction rows, input badges, warning plaque |
| Settings | Menu/pause surfaces | Settings frame, audio/control rows, toggles and sliders |

## Generated master-sheet plan

Twenty 4x2 sheets provide 160 base production parts:

1. App shell and content frames
2. Primary gameplay HUD
3. HUD action and upgrade slots
4. Leaderboard podium family
5. Weekly competition family
6. Funding and proposal family
7. Mission-record and wallet family
8. Home and navigation family
9. Pause and settings family
10. Mission-result family
11. Tutorial and story family
12. Hangar and upgrade family
13. Notifications and status family
14. Achievements and more-menu family
15. Form controls
16. General-purpose borders
17. Weekly champion animation rig
18. Funding vault animation rig
19. Mission record verification rig
20. Alert banner animation rig

Interactive base assets receive generated runtime state derivatives for hover,
pressed, selected, disabled, warning, and success where relevant. Manifests mark
which panels are nine-slice safe and document recommended text padding, anchors,
and React/Pixi ownership.

## Animation contract

- Production uses layered PNG parts plus an animation manifest.
- Gallery GIFs are synchronized visual proofs, never production animation files.
- React/Pixi code inserts live text and values above the moving frame layers.
- Hover loops remain 2-4 px. Mechanical reveals get one anticipation, one lock,
  one restrained settle, and no repeated bounce.
- Audio events are named in manifests so the existing restrained servo/pressure
  door family can be connected later without baking audio into artwork.
- The first-place leaderboard living-machinery idle keeps its existing 752 x
  306 registration fixed while real component sprites move: paired turbine
  blade disks rotate inside locked housings, the crown diamond swaps among four
  energy drawings, twelve rail lamps swap among six illumination drawings, and
  short block-pixel energy packets fire locally between sockets. Reduced motion
  uses the untouched base PNG with dim component states.
