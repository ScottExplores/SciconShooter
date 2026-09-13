# The fly circuit is now playing Scicon — first pilot report

September 13, 2026. This report freezes the first completed comparison; the live
experiment can continue accumulating later data without rewriting this result.

**The game is actually connected now.** A small computer model built from 250
identified fly cells chooses left, right or hold during the real Scicon boss fight.
The ship fires automatically. When a shot damages the boss, the game sends a
numerical teaching signal to the model. Its connection strengths change and carry
into the next encounter. Those strengths affect later choices.

We are asking one simple question: **does feedback help this particular circuit
stay lined up with the boss and hit it more effectively?** We are not assuming
that the answer is yes.

## What the first comparison found

We measured three 20-second tests before training, gave the controller three
60-second practice bouts, then repeated the same three tests with its memory
frozen. No learning happened during the tests.

| Test seed | Before: boss damage/second | After: boss damage/second |
|---|---:|---:|
| 9124 | 0.9450 | 0.7425 |
| 9125 | 2.9700 | 0.9450 |
| 9126 | 3.4425 | 2.6325 |
| Mean | **2.4525** | **1.4400** |

After three simulated minutes of practice, damage per second was approximately
41.3% lower. Average horizontal separation from the boss also worsened, from
about 97 to 147 pixels. Every paired test worsened on both measures. This first
result therefore **does not show improved aim**. It is one controller with three
test seeds, not a replicated scientific study or a statistical significance claim.

The feedback mechanism did operate: by the audit checkpoint, 108 connection
efficacies had changed, 153 nonzero reward doses had been delivered and many
action probabilities differed from their original equal probabilities. Changing
memory is not enough; useful learning requires better controlled performance.

## What the brain display means

The highlighted cells use activity values from the model that is choosing the
movement. They are not decorative flashes. The three bars show its cue-related,
output and reward-related modeled activity. They are numerical rates, not
recorded biological spikes or chemical dopamine.

The model includes a small mushroom-body memory circuit with real released
anatomical contacts. It does not simulate the entire fly. Screen processing,
assignment of movements, reward magnitude and learning equations are engineering
choices. Optic lobes and the nerve cord are shown for anatomical context and are
not secretly receiving simulated activity. The failed full-CNS gates have not
been relabeled as passed.

## What was checked

An independent audit reconstructed rewards and connection changes from 6,391
journal records, verified the saved checkpoint against that ledger and found no
efficacy changes during all six frozen tests. The checkpoint preserved the model's
exact random-generator state as well as its weights. A clean restart restored
the same session, replayed the unfinished game's recorded actions with matching
state and frame hashes, and continued training successfully.

All 6,369 recorded position checks were within the game boundaries. The engine
enforces those boundaries; this does not demonstrate learned boundary avoidance.
The pixel detector had a separate reward-free calibration. Ship clipping at the
screen edges introduces a documented centroid bias and remains a limitation.

Focused validation passed 10 Python model tests, five Node runner/bridge tests
and 13 public-feed tests. The public build and bundled evidence assets were
verified, with desktop/mobile layout and read-only behavior checked visibly.
These checks establish software behavior and artifact integrity, not biological
realism or improved gameplay.

## What continues

The same model continues boss practice with regular frozen tests and retained
memory. Points and boss damage accumulate for the display; they are not measures
of improvement. The next meaningful controlled study compares independent model
seeds against fixed weights and shuffled reward timing. Delayed projectile hits
may credit the wrong movement, but that is a hypothesis to test in a new version,
not an explanation established by these data. The current constants remain fixed.

No settings or purchases are needed from Scott. Leave the PC awake if you want
the live session to continue; turning off only the screen is fine. The website
shows stale or failed data honestly if the local experiment stops.

[Watch the live experiment](https://scicon-fly-watch.scottexplores.chatgpt.site/).
[Exact model and sources](BOSS_LEARNING_MODEL.md).
[Independent audit snapshot](evidence/boss-learning-first-pilot-audit-v2.json).
[Operating and recovery instructions](OVERNIGHT_RESEARCH.md).

Session: `boss-learning-live-v2-494657ea`. Source commit:
`d1921ac92cf83d5656261562db7e4d23ea4b8aeb`. The earlier v1 baseline attempt failed
checkpoint transport before training and remains preserved; the byte-preserving
transport repair is documented in the model methods. No failed result was erased.
