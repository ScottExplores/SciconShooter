# More practice did not improve this controller's aim

Progress report recorded September 13, 2026, 16:35 PDT (23:35 UTC).
This is the scheduled report after at least 24 training bouts. By the first
hourly follow-up, 34 training bouts and 36 frozen evaluations had completed.
The latest complete evaluation group followed bout 33. The unfinished current
bout is excluded from completed evaluation results.

**The game and feedback mechanism are working, but this particular controller
became less effective at aiming.** More practice has not reversed the first
negative result. This is useful evidence about this candidate, not a finding
that every possible fly model is unable to learn the game.

## The result in plain language

The controller practiced against the boss while confirmed hits changed its
connection strengths. Every three practice bouts, we tested it on the same
three action seeds with those strengths frozen. Better aiming should increase
damage per second and reduce horizontal distance between ship and boss.

| Test point | Practice completed | Mean boss damage/second | Mean horizontal separation |
|---|---:|---:|---:|
| Before training | 0 simulated minutes | 2.4525 | 97.36 pixels |
| First pilot | 3 simulated minutes | 1.4400 | approximately 147 pixels |
| Reporting milestone | 24 simulated minutes | 0.6750 | 177.09 pixels |
| Latest complete tests | 33 simulated minutes | 0.7200 | 170.65 pixels |

At the latest complete checkpoint, damage per second remained **70.6% below the
starting value**, and alignment was worse on all three matched seeds. The small
recovery from bout 24 to bout 33 does not establish useful learning.

| Test seed | Starting damage/second | After 24 bouts | After 33 bouts |
|---|---:|---:|---:|
| 9124 | 0.9450 | 0.4050 | 0.4725 |
| 9125 | 2.9700 | 0.8100 | 0.8100 |
| 9126 | 3.4425 | 0.8100 | 0.8775 |

These are repeated tests of **one controller**, not 36 independent learning
replicas. We have not completed comparisons with separately trained controllers,
fixed weights or shuffled reward timing. These descriptive measurements do not
establish statistical significance, anatomical-topology benefit or a biological
fly's learning ability. The reporting milestone was an operational follow-up,
not a prespecified significance threshold. No parameters were tuned after
watching these outcomes.

## Was it actually receiving feedback and remembering it?

Yes. At the clean-stop audit, 108 connection efficacies differed from their
initial values. The journal contained 755 nonzero numerical reward doses and
11,354 individual efficacy-change records. Movement probabilities were affected
by the altered weights. None of that alone proves better gameplay.

The independent artifact audit passed across 56,001 journal records and 55,826
game steps. It reconstructed the reward ledger and connection changes, verified
the original Python checkpoint bytes, and matched checkpoint weights to the
ledger. All 36 frozen evaluations had zero efficacy-change records. There was
no pending reward at the stop. The unfinished bout was explicitly identified.

All recorded ship positions remained within the screen. The game itself enforces
those limits, so this does not mean the controller learned boundary avoidance.
The public display's recent-evaluation list is capped; the complete evaluation
history remains in the journal and the audit snapshot.

## What happened during the follow-up

The existing runner stopped through its documented stop request. After the audit
passed, it resumed the **same session and retained model state** under unchanged
methods. The runner verified replayed state and frame hashes before continuing.
The public browser again showed LIVE gameplay and actual model activity.
The initial pilot report and all failed attempts remain unchanged.

The session occupied approximately 159 MB at this checkpoint, within its 8 GiB
budget; approximately 478 GB remained available on the disk. The simulation and
outbound publisher were healthy after resumption. A direct command-line public
GET encountered a managed browser challenge; the existing browser showed a fresh
live feed and the publisher remained connected. No access checks were bypassed.

## What this suggests next

The present result favors testing the design rather than assuming longer play
will fix it. The next controlled comparison should keep this version unchanged
and compare independent seeds with plastic, fixed and shuffled-reward conditions.
One hypothesis is that delayed projectile impacts credit the wrong recent
movement. That needs a separately versioned test; these data do not establish
the cause. The existing positive-only bounded rule can also saturate.

For now the same live experiment continues, with its negative result preserved
and its evidence status unchanged. The hourly monitor will stay quiet on routine
healthy checks and notify only on a meaningful change or a problem. Scott does
not need to change settings or buy equipment.

## Evidence

- [Independent audit snapshot](evidence/boss-learning-progress-audit-20260913T2335Z.json)
- [Unchanged first pilot report](BOSS_PILOT_REPORT.md)
- [Model, engineering assumptions and primary sources](BOSS_LEARNING_MODEL.md)
- [Operating instructions](OVERNIGHT_RESEARCH.md)
- [Live viewer](https://scicon-fly-watch.scottexplores.chatgpt.site/)

Session: `boss-learning-live-v2-494657ea`.
Frozen model source commit: `d1921ac92cf83d5656261562db7e4d23ea4b8aeb`.
Audit journal SHA-256: `2018dfe25cb9a19a04c011c6f3575f76d240364ebdf294ae0b4f1b9d9adce887`.
Last audited chain hash: `dc0be4dba73f9ecadf25673175a9808857bb469e15503885efe3fd2afb10f064`.
The live journal and checkpoint continue beyond this fixed audit snapshot.
