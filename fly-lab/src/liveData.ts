export type LiveSnapshot = {
  schemaVersion: 1; kind: 'scicon-continuous-live-v1'; sessionId: string; sequence: number;
  updatedAt: string; serverNow?: string; status: string;
  controller: { id: string; name: string; learningStatus: 'not-learning'|'fixed-evaluation'|'training' };
  phase: { kind: 'boss'|'wave'; name: string; elapsedSeconds: number; damage: number; hits: number; damagePerSecond: number };
  totals: { score: number; bossDamage: number; bossHits: number; simulatedSeconds: number };
  action: {movement: string; fire: boolean};
  feedback: {hitCount: number; bossDamage: number; computedReward: number; deliveredReward: number; deliveryStatus: string; lastHitAt: string|null};
  neural: null|{spikes: number; sampledNeurons: {id: string; type: string; spikes: number}[]};
  image: string; error: string|null;
};
export function validateLive(value: LiveSnapshot): LiveSnapshot {
  const valid = (n: unknown) => typeof n==='number' && Number.isFinite(n) && n>=0;
  if (value?.schemaVersion!==1 || value.kind!=='scicon-continuous-live-v1' || !value.sessionId
    || !Number.isSafeInteger(value.sequence) || value.sequence<0 || !Number.isFinite(Date.parse(value.updatedAt))
    || !value.controller || !['not-learning','fixed-evaluation','training'].includes(value.controller.learningStatus)
    || !['boss','wave'].includes(value.phase?.kind) || !valid(value.phase.damagePerSecond)
    || !['score','bossDamage','bossHits','simulatedSeconds'].every(k=>valid(value.totals?.[k as keyof LiveSnapshot['totals']]))
    || !['idle','N','NE','E','SE','S','SW','W','NW'].includes(value.action?.movement) || typeof value.action.fire!=='boolean'
    || !value.feedback || !valid(value.feedback.deliveredReward) || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value.image)
    || (value.controller.learningStatus==='not-learning' && (value.neural!==null || value.feedback.deliveredReward!==0))) throw new Error('The live feed could not be verified.');
  return value;
}
export function feedIsLive(snapshot: LiveSnapshot|null, receivedAt: number, now: number) {
  if(!snapshot || !['running','transitioning'].includes(snapshot.status))return false;
  const sourceAge=(snapshot.serverNow?Date.parse(snapshot.serverNow):receivedAt)-Date.parse(snapshot.updatedAt);
  return now-receivedAt+Math.max(0,sourceAge)<15000;
}
