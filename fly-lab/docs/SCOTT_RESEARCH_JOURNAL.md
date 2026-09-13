# Scott's research journal — September 13, 2026

We are turning a fly's published wiring diagram into a computer model and testing whether that model can eventually learn to play Scicon Shooter. The project is running real experiments, but **we have not demonstrated a learning fly controller yet**.

You do not need to choose another controller or work out the settings. The next useful work is a sequence of small vision tests. A random controller playing for longer cannot learn: it has no learning model attached.

**Latest display:** [Learning demonstration](http://127.0.0.1:5180/#learn). We now have a small synthetic circuit that changes its response after a cue is paired with reward. It is a separate teaching experiment, not the MaleCNS brain learning the game. The result and its limits are explained in the newest entry below.

## What the gates mean

A gate is a question we answer with a recorded experiment. It is not a switch we turn on to unlock a better-looking demonstration.

| Question | Where we are today |
|---|---|
| Does the simulator calculate its equations correctly? | The tested equations agree with an independent simulator. This checks the software, not whether every real fly cell behaves that way. |
| Can the model make useful sense of pictures? | Our first MaleCNS visual candidate failed. It activated the input cells but did not produce responses in the nominated learning circuit. |
| Can those responses control the game? | The first candidate failed this screen too: its output remained still and did not fire. |
| Can a cue paired with a reward produce a specific memory? | Not yet tested in the real-data candidate. |
| Does that memory improve gameplay? | Not tested yet. We will need repeated training runs and fair comparisons with controllers that cannot learn. |

Passing a gate applies to the particular model and test used. Substantially changing that model can mean checking earlier gates again. Some checks can run in parallel; none should be replaced by a nicer animation.

## What we have learned and changed

**The game and recorder work.** The earlier six short baseline episodes produced reproducible records. A representative replay matched the recorded game states, images and events. Your later random-controller run also finished and is saved: it scored 191 and ended after about 48 simulated seconds. These are useful checks of our equipment, not learning results.

**Having the wiring does not automatically give the model sight.** We found that the original visual input made important assumptions about how light excites cells. Many early fly visual cells respond through changing activity levels rather than simple spikes. Some reduce their activity when light appears. A model must represent that properly before a reward can teach it much.

**The anatomical map has a usable starting point, with gaps.** In the retained data, the R1–R6 photoreceptors lack the paired optic-column labels used by our screen mapper. We cannot honestly pretend that those cells already have known screen positions. Some later visual populations have much better label coverage; the detailed inventory identifies matching L2, Tm1 and Tm2 columns for a small, declared sensory experiment. Those labels are not yet a calibrated fly eye.

**We made a faster calculation available for tests.** In short full-connectome probes, an optional implementation ran about five times faster and matched every tested timestep of the original. It still needed roughly 13 seconds of computer time per simulated second in the stimulated probe. That is a measured speedup for this particular test, not a promise that full training can run at game speed.

**A published visual reference now runs here.** We completed 29 short trials using an existing FlyVis model with its pretrained settings held fixed. All eight tested motion-cell types preferred the expected direction over the opposite direction; seven of eight matched the expected bright/dark preference. Repeated inputs produced identical responses. We kept the eighth mismatch in the report. This is a useful sight-test reference, not our MaleCNS fly learning Scicon.

**We checked what was actually transmitting.** A follow-up made 12 comparisons with an early visual pathway intact, blocked, or unchanged through a control procedure. All 1,442 cells in the two nominated populations stayed below the level that sends output during the recorded stimuli. Blocking their connections also during startup produced small differences that diminished over time. This shows why visible activity and useful motion responses do not, by themselves, prove that the expected pathway is doing the work. We should not borrow this checkpoint's settings without further calibration.

**The dashboard now explains its controls.** Random, manual, frozen-neural and plastic-neural selections have plain descriptions. An expandable explanation tells you what each gate checks. Selecting a neural controller cannot manufacture the missing evidence.

## Why rewards come later

The experiment's initial reward rule is +1 for a confirmed enemy destruction and −5 for a life lost. A numerical reward can influence an eligible learning model; a random controller does not learn from it. Coins are not currently an additional training reward.

Before adding coin rewards, we need to show that the model can detect useful visual differences and form a cue-specific memory. Otherwise, a changing score could simply reflect luck or our engineering choices. When we test coins, we should label that as a separate reward experiment and compare it fairly.

## What happens next

1. Build a small, separately versioned sensory candidate using actual MaleCNS connections and published light-response measurements. The anatomical inventory nominates a 57-cell circuit for this diagnostic. Its baseline activity and timing need calibration; the reference checkpoint is not a ready-made biological answer.
2. Test bright and dark patterns, stability and timing on inputs reserved for evaluation. Then check that the signals reach the nominated learning circuit and can cause the declared actions.
3. Establish cue/reward conditioning. Only then start bounded game-learning batches with saved checkpoints and fair evaluation controls.

The central question is whether the declared model improves because of its learning rule, and which biological and engineered choices explain that improvement. A repeatable failure is useful when it tells us what assumption to change.

## What you need to do

No controller changes, Raspberry Pi setup or purchases are needed for this stage. The existing PC is enough for these bounded tests. Turning its screen off is fine while it remains awake; actual system sleep pauses local computation. **This session's experiment jobs are complete; no training batch is running.** There is no reason to leave a random game running overnight. Finalized records remain saved when a job stops.

The simple Watch page is for seeing recorded gameplay and clearly labeled signals. The Live controls are experiment equipment. Neither activity on the screen nor a higher score by itself proves that a fly model has learned.

Technical records: [initial results](RESEARCH_START_RESULTS.md), [visual reference measurements and plots](evidence/flyvis-reference-v1/README.md), [pathway check](evidence/flyvis-pathway-v1/README.md), [visual boundary inventory](evidence/vision-boundary-inventory-v1.md), and [numerical speed comparison](evidence/lif-fast-benchmark.md).

## Morning follow-up: what finished and what did not

When you asked us to keep working overnight, the next job and automatic follow-up
had not been established before the session stopped. The earlier trials above
were saved, but **the proposed new work did not run overnight**. I corrected that
when you came back and asked. No fly controller was secretly training while you
were away.

I then resumed the work and completed **45 new sight-circuit trials**. We used
57 actual cells from the published fly wiring and checked whether a changing
light signal could travel between them under our declared model. It could.
Blocking the pathway removed the downstream response; unchanged repeats agreed,
and the calculation stayed stable. These small trials took about 30 seconds,
not an overnight training session.

Think of this as checking a few wires and switches before testing the whole
machine. We chose several of the cell settings ourselves, so it does not yet
prove that the model sees like a real fly. The real fly has many additional
connections around this little circuit. The sight gate is still unpassed, and
we have not started reward learning or shown better gameplay.

We also found and acquired published average recordings of real visual-cell
responses. Comparing against them is the next useful step, after resolving how
the researchers timed their flashes and measured the responses. Their small
files do not include individual flies, so a good-looking fit alone would not
establish independent validation.

An **hourly automatic follow-up is now active in this Codex task** to continue
the bounded research and update this journal when something meaningful changes.
It depends on the local computer and Codex environment being available; it is
not a continuously running game-training job. This morning's simulation batch
has completed. No controller changes, Raspberry Pi or purchases are needed.

See the [new result and plots](evidence/graded-off-diagnostic-v1/README.md) and
the [continuation checkpoint](OVERNIGHT_RESEARCH.md). The full Python suite
passed: 226 tests, including the new numerical and recording checks.

## Watching the app, learning, and what the lights mean

**We are not training from every match.** The saved random matches and their
replays do not change a fly model. Once the sensory, action and conditioning
checks support it, training matches will update the declared learning mechanism.
Separate evaluation matches will keep that memory fixed so we can measure
improvement fairly. Evaluation must not quietly train on its test material.

I opened Watch on your saved random-baseline recording. The game images, recorded
controls and movement path come from that actual episode. Watching it loop does
not create more matches or run the learning study.

**The anatomy is sourced; the electricity was an illustration.** I checked all
43,864 displayed cell-body positions against the stored source annotations and
the two displayed nerve-cell shapes against their source geometry. The colored
pulses used image changes and button commands to illustrate possible information
flow. They were not records of which modeled neurons fired. The prior caption
said this, but the default appearance was too easy to misunderstand.

Those illustrations now default off. A prominent label explains that neural
activity is not connected to the anatomical view. You can optionally turn on
clearly labeled game-cue illustrations. The separate neural-telemetry panel shows
actual simulation measurements when a neural worker supplies them; these are
computer-model data, not recordings from a living fly. Losing the connection
now removes the stale LIVE indication and labels old telemetry as old.

The existing hourly follow-up now covers the study phases through an auditable
conclusion, rather than stopping at the next small milestone. It can continue
while the local computer and Codex are available. A genuine data/resource
dependency may still require your help; it cannot guarantee a learning result.

In this follow-up we also clarified how the published visual recordings were
timed and scaled. The larger data file is still unavailable through the
automated public download: the website returns a validation page instead of the
recording. We saved the exact expected file hashes and the rejected responses.
This is an access limitation, not missing or negative scientific evidence. We
can continue preparing a clearly labeled aggregate calibration, but independent
biological validation needs the individual-fly records.

Technical records: [measurement crosswalk](evidence/l2-measurement-crosswalk-v1.md)
and [data acquisition record](evidence/l2-data-acquisition-v1.md). The display
change passed typechecking, all 16 JavaScript tests, the private build, and
desktop/mobile browser checks including simulated connection failures. No new
game-training episode was started during these checks.

## September 13: the individual-fly recordings are now available

The normal website download worked. We now have the researchers' processed L2
visual-cell recordings and the spreadsheet identifying the animals and viewing
conditions. All three files matched the source's exact file fingerprints before
we opened them. We downloaded about 112 MiB of selected material, not the huge
complete imaging archive.

This matters because an average curve hides differences between animals. We
can now work toward checking the model on individual flies while keeping all
measurements from the same animal together. First we must confirm which
recordings and conditions belong together; simply collecting more files does
not prove that our model sees correctly.

We also added an independent implementation of the published L2 response
equations. All 44 focused math checks passed. Those checks establish that the
equations are being calculated as declared, not that their settings match a fly.
One check shows that different internal voltage scales can produce identical
predicted fluorescence. We therefore cannot claim to have measured real voltage
or transmitter release merely by matching a curve.

The next task is to lock the measurement and comparison rules before fitting.
The app is still displaying the clearly labeled saved random match. No match is
training a fly yet, and no learning gate was changed in this follow-up. The
hourly research continuation remains active while this computer and Codex are
available. No Raspberry Pi, purchases or controller changes are needed now.

Records: [successful acquisition](evidence/l2-data-acquisition-v2.md) and
[numerical reference](evidence/l2-numerical-reference-v1.md).

The first detailed check found **23 of the 103 selected recording rows have
unresolved labels**. Some names point to a different genetic condition in the
spreadsheet; others have no matching entry. That does not establish that the
measurements are wrong. It means we need the source history before confidently
claiming which animals and conditions they represent.

We reproduced the inventory independently and kept those discrepancies visible.
The audit used roughly 95 MiB of memory and about four seconds; it was a small
data check, not a new long-running brain simulation. Next I am tracing the
source labels. If some cannot be resolved, any smaller usable dataset will have
an explicit scope and exclusion rule, rather than guessed identities.

See the [recording audit](evidence/l2-dryad-inventory-v2.md). No sight, learning,
or gameplay improvement claim follows from this result.

## September 13: the source labels now make sense

The researchers left spreadsheet notes explaining that two flies were renamed
to distinguish folders with the same date. Those notes, checked against the
recording details, resolve all 23 questionable selected rows. All 103 selected
measurement rows now have supported matches to the released records. We kept
the original names and earlier discrepancy report so the correction is traceable.

Averaging those recordings using the authors' method exactly matches the small
bright-light dataset used by their model. The dim-light dataset does not match;
we recorded that difference without guessing a fix. Independent checks reproduced
both findings. This tells us which measurements we have, not whether our
simulated fly sees correctly.

We fixed the groups for the next model test: eight released fly groups for
development and five for reserved assessment, keeping recordings from each
date together. The reserved measurements will be excluded from tuning. They
were already used in the source check, so this is an internal assessment,
not a claim that nobody has seen the test data. We still need to lock the
fitting rules, including how repeated flashes are handled, before tuning.

**No match is training a fly yet.** Watch shows a real saved random-baseline
match. Its anatomical positions come from MaleCNS; illustrative electric cues
default off. Recorded neural activity is not connected to that anatomy view.
Separate model telemetry shows measurements only when a neural worker supplies
them. Those would be computer-model data, not recordings from a living fly.

Hourly research continuation remains active while the computer and Codex are
available. We will work through the checks and report an honest outcome,
including a negative result if the model cannot learn the task. No controller
changes or hardware purchases are needed now.

Records: [label reconciliation](evidence/l2-workbook-crosswalk-v1.md),
[average comparison](evidence/l2-aggregate-lineage-v1.md), and
[reserved assessment assignment](evidence/l2-calibration-cohort-v1-freeze.md).

## September 13: a small learning experiment you can watch

We simplified the immediate goal: show a cue, pair it with a reward signal,
and measure whether the circuit responds differently afterward. This experiment
uses four synthetic neurons and our actual simulator and learning rule. It does
not load the fly's anatomical wiring or control Scicon Shooter.

**It produced a measurable memory effect.** Before training, either cue caused
16 output spikes in the test window. After paired training, the rewarded cue
caused 10 spikes and the other still caused 16. Learning here is a selective
reduction in response, not a higher score or a preference. Separating the reward
from the cue, or disabling learning, prevented that change. Erasing the stored
connection changes removed it; an unchanged control and restoring the trained
state retained it. Swapping which cue received reward gave the corresponding
result. These are checks within one engineered model, not independent fly trials.

Open the **Learning demo** from Watch or the research controls. **Run learning
experiment** computes a fresh, short experiment. **Play recording** lets you
watch its saved activity; it does not continue training. The glowing circles
show actual spikes emitted by the calculation. The diagram is explicitly a
schematic, and its numbers are model measurements, not a real fly recording.
You can compare the three conditions and download the entire experiment.

The first saved calculation took about four seconds and roughly 49.5 MiB of
sampled worker memory. There is no reason to leave this small demo repeating
all night. Its settings are deliberately simple enough to explain. The full
MaleCNS project still needs the sight, action and learning checks; this small
result does not pass those gates.

The earlier research-data download succeeded. No login or help with Chrome is
needed. I also checked [Impact Fly's own About panel](https://fly.researchhub.foundation/):
it describes a simulated wallet and $100 simulated allocations, explicitly with
no money transferred. That display does not establish that a fly understands
research proposals. Our project has not spent RSC or selected a funding proposal.

No purchases, Raspberry Pi setup or controller choices are needed now. The
hourly research follow-up remains active for useful bounded work on the larger
study. We will keep reporting what was measured and what remains uncertain.

Technical result: [teaching demonstration](evidence/teaching-demo-v1.md).
