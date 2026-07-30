# Audio sources and release provenance

This document accompanies `public/audio/audio-asset-manifest.json`, which is the
hash-pinned machine-readable record for the imported audio in the July 30, 2026
sound pass. The deployed manifest carries the required music credit with the
browser game. Its `assets` array covers the 14 files imported or re-rendered by
this pass; it is not intended to inventory every pre-existing audio file in the
repository.

## Required attribution

“Outer Space Music Pack” by Leonardo Paz, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The files are used
without editorial cuts, remixing, or loudness changes. Their filenames were
changed and the OGG delivery files were compatibility-transcoded to MP3 for
Scicon Shooter.

Source: <https://opengameart.org/node/118190>

The shipped selections are “Stillness of Space,” “Building a Colony,” “Racing
Through Asteroids,” and “Battle in Outer Space.”

## Other licensed sources

- The boss warning, rotary-blaster volley, and mission-launch clips are edited
  from SoundMorph masters distributed in the Sonniss GDC Game Audio Bundle.
  The [Sonniss GDC Bundle License](https://sonniss.com/gdc-bundle-license/)
  permits commercial use and modification without attribution and prohibits
  selling the source sounds as-is.
  Scicon Shooter ships only cropped, resampled production derivatives, not the
  96 kHz/24-bit masters. Bundle archive: <https://sonniss.com/gameaudiogdc/>.
  The official Sonniss archive and license pages establish provenance and
  permissions. The per-file URLs recorded as `retrievalMirrorUrl` in the
  manifest identify the third-party archive mirror used for retrieval; that
  mirror is not operated by Sonniss.
- The six interface cues come from Kenney’s
  [Interface Sounds](https://kenney.nl/assets/interface-sounds), released under
  CC0. They were trimmed for immediate response, resampled to 48 kHz, faded at
  both edges, and peak-matched.
- “Final Hour” by isaiah658 is released under CC0. Source:
  <https://opengameart.org/content/final-hour>.

## Production edits

| Runtime file | Source selection | Crop | Fade in/out | Nominal / measured sample peak | Output |
| --- | --- | ---: | ---: | ---: | --- |
| `sfx/boss-warning.wav` | `alarm_loops_08.wav` | 0.000–2.400 s | 8/120 ms | -4 / -4.0338 dBFS | 48 kHz stereo PCM16 |
| `sfx/boss-rotary-burst.wav` | `Blaster Machine_Gun-01-Burst-03.wav` | 0.000–0.620 s | 4/100 ms | -4 / -4.0612 dBFS | 48 kHz stereo PCM16 |
| `sfx/mission-launch.wav` | `lightbike_takeoff_03.wav` | 0.000–2.100 s | 5/280 ms | -4 / -4.1334 dBFS | 48 kHz stereo PCM16 |
| `ui/click.wav` | `click3.wav` | 0.000–0.078 s | 2/20 ms | -6 / -6.0105 dBFS | 48 kHz stereo PCM16 |
| `ui/confirm.wav` | `switch15.wav` | 0.030–0.235 s | 3/25 ms | -6 / -5.3451 dBFS | 48 kHz stereo PCM16 |
| `ui/back.wav` | `switch26.wav` | 0.025–0.175 s | 3/22 ms | -6 / -5.4185 dBFS | 48 kHz stereo PCM16 |
| `ui/error.wav` | `switch34.wav` | 0.035–0.355 s | 3/30 ms | -6 / -5.3113 dBFS | 48 kHz stereo PCM16 |
| `ui/open.wav` | `switch10.wav` | 0.095–0.225 s | 3/22 ms | -6 / -6.0418 dBFS | 48 kHz stereo PCM16 |
| `ui/close.wav` | `switch11.wav` | 0.052–0.170 s | 3/22 ms | -6 / -6.1085 dBFS | 48 kHz stereo PCM16 |

The rotary file is a 620 ms production burst with a 100 ms release starting at
520 ms. It is intended to fire once per complete short boss volley, not once per
projectile. The launch file keeps the ignition and accelerating takeoff gesture
and omits the extended engine coast.

## Music compatibility delivery

The five newly imported music files ship as 44.1 kHz stereo MP3 at 192 kb/s
CBR. They were transcoded from their hash-pinned OGG Vorbis downloads with
FFmpeg 7.0/libmp3lame. MP3 was selected because it is supported across current
and older iPhone/Safari playback stacks; no cut, mix, or loudness processing was
applied. The manifest retains each original OGG filename, download URL, SHA-256,
and byte length as provenance while pinning the deployed MP3 separately.

## Legacy music warning

`acid-clatter.mp3`, `pressure.mp3`, and `exellent.mp3` remain in the playlist at
the product owner’s request. Their original sources and redistribution licenses
are not documented in this repository, so the manifest labels them
`legacy-unverified`. Do not describe those three files as licensed until their
rights are independently documented.
