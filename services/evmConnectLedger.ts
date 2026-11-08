export interface LedgerSession<P> {
  method: 'base-account' | 'injected' | 'walletconnect';
  name: string;
  rdns?: string;
  provider: P;
}

export interface ConnectLedger<P> {
  generation: number;
  committed: LedgerSession<P> | null;
  address: string | null;
  pending: Array<{ generation: number; provider: P }>;
}

export interface SettleResult<P> {
  state: ConnectLedger<P>;
  applied: boolean;
  disconnect: P[];
}

export const createConnectLedger = <P>(): ConnectLedger<P> => ({
  generation: 0,
  committed: null,
  address: null,
  pending: []
});

export const startConnectAttempt = <P>(state: ConnectLedger<P>) => {
  const generation = state.generation + 1;
  return {
    generation,
    state: { ...state, generation }
  };
};

export const trackPendingProvider = <P>(
  state: ConnectLedger<P>,
  generation: number,
  provider: P
): ConnectLedger<P> => ({
  ...state,
  pending: [
    ...state.pending.filter((entry) => entry.generation !== generation),
    { generation, provider }
  ]
});

export const rememberCommittedSession = <P>(
  state: ConnectLedger<P>,
  session: LedgerSession<P> | null,
  address: string | null
): ConnectLedger<P> => ({
  ...state,
  committed: session,
  address
});

const uniqueProviders = <P>(providers: P[]) => {
  const seen = new Set<P>();
  const result: P[] = [];
  providers.forEach((provider) => {
    if (seen.has(provider)) return;
    seen.add(provider);
    result.push(provider);
  });
  return result;
};

const providersStillPending = <P>(
  pending: Array<{ generation: number; provider: P }>,
  generation: number
) => {
  const protectedProviders = new Set<P>();
  pending.forEach((entry) => {
    if (entry.generation > generation) protectedProviders.add(entry.provider);
  });
  return protectedProviders;
};

/**
 * Only the current generation may change the committed provider and address,
 * and it changes them together. An older completion disconnects only the
 * provider that attempt registered, and only when that object is not the
 * committed provider or still referenced by a newer pending attempt.
 */
export const settleConnectAttempt = <P>(
  state: ConnectLedger<P>,
  input: {
    generation: number;
    outcome: 'authorized' | 'rejected' | 'cancelled';
    session?: LedgerSession<P> | null;
    address?: string | null;
  }
): SettleResult<P> => {
  const owns = state.pending.filter((entry) => entry.generation === input.generation);
  const pending = state.pending.filter((entry) => entry.generation !== input.generation);
  const current = input.generation === state.generation
    && input.outcome === 'authorized'
    && Boolean(input.session)
    && Boolean(input.address);
  const stillPending = providersStillPending(pending, input.generation);
  if (!current) {
    if (state.committed?.provider) stillPending.add(state.committed.provider);
    return {
      state: { ...state, pending },
      applied: false,
      disconnect: uniqueProviders(
        owns.map((entry) => entry.provider)
          .filter((provider) => !stillPending.has(provider))
      )
    };
  }
  const session = input.session as LedgerSession<P>;
  const previous = state.committed?.provider;
  stillPending.add(session.provider);
  return {
    state: {
      generation: state.generation,
      committed: session,
      address: input.address as string,
      pending
    },
    applied: true,
    disconnect: uniqueProviders([
      ...owns.map((entry) => entry.provider).filter((provider) => !stillPending.has(provider)),
      ...(previous && !stillPending.has(previous) ? [previous] : [])
    ])
  };
};

/** Invalidates every in-flight attempt. Does not disconnect the committed provider. */
export const supersedeConnectAttempts = <P>(state: ConnectLedger<P>): SettleResult<P> => {
  const started = startConnectAttempt(state);
  return {
    state: { ...started.state, pending: [] },
    applied: false,
    disconnect: uniqueProviders(
      state.pending.map((entry) => entry.provider)
        .filter((provider) => provider !== state.committed?.provider)
    )
  };
};

export const dropCommittedSession = <P>(state: ConnectLedger<P>): SettleResult<P> => {
  const superseded = supersedeConnectAttempts(state);
  return {
    state: {
      ...superseded.state,
      committed: null,
      address: null,
      pending: []
    },
    applied: true,
    disconnect: superseded.disconnect
  };
};

export const shouldCommitWalletAuthentication = (
  generation: number,
  currentGeneration: number
) => generation === currentGeneration;
