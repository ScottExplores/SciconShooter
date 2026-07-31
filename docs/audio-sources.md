# Audio sources and release provenance

This document accompanies `public/audio/audio-asset-manifest.json`, the
hash-pinned record for the sound-effect and interface audio imported in the
July 30, 2026 sound pass. Its production `assets` array covers nine files; it
does not attempt to inventory every pre-existing sound effect in the repository.

Background music has been removed from the product. The manifest retains the
former track metadata under `removedBackgroundMusic` and `removedLegacyMusic`
for audit history only. Those files do not ship, play, preload, or appear in
the game's settings.

## Licensed sources

- The boss warning, rotary-blaster volley, and mission-launch clips are edited
  from SoundMorph masters distributed in the Sonniss GDC Game Audio Bundle.
  The [Sonniss GDC Bundle License](https://sonniss.com/gdc-bundle-license/)
  permits commercial use and modification without attribution and prohibits
  selling the source sounds as-is. Scicon Shooter ships only cropped, resampled
  production derivatives, not the 96 kHz/24-bit masters. The official archive
  is at <https://sonniss.com/gameaudiogdc/>.
- The six interface cues come from Kenney's
  [Interface Sounds](https://kenney.nl/assets/interface-sounds), released under
  CC0. They were trimmed for immediate response, resampled to 48 kHz, faded at
  both edges, and peak-matched.

## Production edits

| Runtime file | Source selection | Crop | Fade in/out | Nominal / measured sample peak | Output |
| --- | --- | ---: | ---: | ---: | --- |
| `sfx/boss-warning.wav` | `alarm_loops_08.wav` | 0.000-2.400 s | 8/120 ms | -4 / -4.0338 dBFS | 48 kHz stereo PCM16 |
| `sfx/boss-rotary-burst.wav` | `Blaster Machine_Gun-01-Burst-03.wav` | 0.000-0.620 s | 4/100 ms | -4 / -4.0612 dBFS | 48 kHz stereo PCM16 |
| `sfx/mission-launch.wav` | `lightbike_takeoff_03.wav` | 0.000-2.100 s | 5/280 ms | -4 / -4.1334 dBFS | 48 kHz stereo PCM16 |
| `ui/click.wav` | `click3.wav` | 0.000-0.078 s | 2/20 ms | -6 / -6.0105 dBFS | 48 kHz stereo PCM16 |
| `ui/confirm.wav` | `switch15.wav` | 0.030-0.235 s | 3/25 ms | -6 / -5.3451 dBFS | 48 kHz stereo PCM16 |
| `ui/back.wav` | `switch26.wav` | 0.025-0.175 s | 3/22 ms | -6 / -5.4185 dBFS | 48 kHz stereo PCM16 |
| `ui/error.wav` | `switch34.wav` | 0.035-0.355 s | 3/30 ms | -6 / -5.3113 dBFS | 48 kHz stereo PCM16 |
| `ui/open.wav` | `switch10.wav` | 0.095-0.225 s | 3/22 ms | -6 / -6.0418 dBFS | 48 kHz stereo PCM16 |
| `ui/close.wav` | `switch11.wav` | 0.052-0.170 s | 3/22 ms | -6 / -6.1085 dBFS | 48 kHz stereo PCM16 |

The rotary file is a 620 ms production burst with a 100 ms release starting at
520 ms. It fires once per complete short boss volley, not once per projectile.
The launch file keeps the ignition and accelerating takeoff gesture while
omitting the extended engine coast.

## Removed background music

All eight former MP3 tracks were removed. Runtime code and release tests reject
`/audio/music/` references so button presses and mission launches never create,
authorize, fetch, or wait for background-media elements.
