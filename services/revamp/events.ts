/** Small synchronous boundary between simulation and optional revamp effects. */
export type RevampEvent = { type: string; [k: string]: unknown };
type Listener = (event: RevampEvent) => void;
const listeners = new Map<string, Set<Listener>>();

const off = (name: string, listener: Listener): void => {
  const group = listeners.get(name);
  group?.delete(listener);
  if (!group?.size) listeners.delete(name);
};
const on = (name: string, listener: Listener): (() => void) => {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(listener);
  return () => off(name, listener);
};
const emit = (name: string, payload: Record<string, unknown> = {}): void => {
  const event: RevampEvent = { ...payload, type: name };
  // Snapshot subscriptions: unmounting an effect during delivery is safe.
  for (const listener of [...(listeners.get(name) ?? []), ...(listeners.get('*') ?? [])]) {
    // An optional visual/audio consumer must never interrupt authoritative combat.
    try { listener(event); } catch { /* Consumer owns its diagnostics. */ }
  }
};
export const revampEvents = { on, off, emit };
