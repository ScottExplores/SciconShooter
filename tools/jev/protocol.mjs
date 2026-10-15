// TypeSafe HTTP contract verified against https://docs.typesafe.ai/api (2026-09-18).
export const MOVEMENTS = Object.freeze({
  idle: 'Stay in place', N: 'Move up', NE: 'Move up and right', E: 'Move right',
  SE: 'Move down and right', S: 'Move down', SW: 'Move down and left', W: 'Move left', NW: 'Move up and left'
});
export const LIMITS = Object.freeze({ seconds: 60, calls: 250, intervalMs: 250, bodyBytes: 24000 });
export const QUESTIONS = {
  movement: {
    type: 'choice', criteria: MOVEMENTS,
    instructions: 'Pilot the player ship in Scicon Shooter for the next 250ms. Choose a movement to avoid incoming projectiles and enemy contact, align under enemies to shoot upward, and collect safe powerups. Survival comes first, then score. Coordinates increase rightward and downward. vx/vy are pixels per 60Hz frame. Firing is automatic. Use current visible state only.'
  },
  special: {
    type: 'choice',
    instructions: 'Which limited special should the Scicon player use now? Respect bombs available and ability cooldown. Save resources until useful against threats.',
    criteria: { none: 'Use neither special', bomb: 'Use one available bomb against dense threats', ability: 'Use the ship ability if cooldown is zero and enemies are present' }
  }
};
export const REVIEW_QUESTIONS = {
  strongest: {
    type: 'choice',
    instructions: 'Based only on this gameplay trace, which observed mechanic most supports engaging play? This is a design assessment, not a claim of feelings. Choose insufficient_evidence if the trace does not support an assessment.',
    criteria: { dodging: 'Reacting to threats and choosing escape routes', targeting: 'Positioning under enemies to attack', pickups: 'Balancing collectible rewards and danger', specials: 'Timing limited special attacks', insufficient_evidence: 'The trace does not support a conclusion' }
  },
  concern: {
    type: 'choice',
    instructions: 'Which playtesting concern is best supported by the trace? Account for controller latency and limited skill. Do not infer visual or audio quality from structured state.',
    criteria: { downtime: 'Long gaps without combat', difficulty: 'Threats may be too punishing', repetition: 'Few meaningful changes in decisions', controller: 'Controller latency or skill prevents a fair assessment', none_observed: 'No supported concern', insufficient_evidence: 'Insufficient observations' }
  }
};
export function validateAnswers(result, questions = QUESTIONS) {
  if (!result || typeof result.model !== 'string' || !result.answers) throw new Error('Invalid Jev response.');
  for (const [name, question] of Object.entries(questions)) {
    const answer = result.answers[name];
    if (answer?.type !== 'choice' || !Object.hasOwn(question.criteria, answer.choice)
      || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
      throw new Error('Invalid Jev decision. Run stopped.');
    }
    const probabilities = answer.probabilities;
    if (!probabilities || Object.keys(probabilities).length !== Object.keys(question.criteria).length
      || Object.keys(question.criteria).some(key => !Number.isFinite(probabilities[key]) || probabilities[key] < 0 || probabilities[key] > 1)
      || Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) > 0.02) {
      throw new Error('Invalid Jev probability distribution. Run stopped.');
    }
  }
  if (!Number.isSafeInteger(result.usage?.input_tokens) || result.usage.input_tokens < 0
    || !Number.isSafeInteger(result.usage?.output_tokens) || result.usage.output_tokens < 0) throw new Error('Missing Jev usage accounting.');
  return result;
}
