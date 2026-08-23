export type AddressResourceStatus =
  | 'idle'
  | 'loading'
  | 'refreshing'
  | 'ready'
  | 'error';

export type AddressResourceRefreshMode = 'dedupe' | 'force' | 'trailing';

export interface AddressResourceState<T> {
  owner: string | null;
  status: AddressResourceStatus;
  value: T | null;
  hasValue: boolean;
  error: unknown | null;
  busy: boolean;
  refreshing: boolean;
}

export interface AddressResourceLoadContext {
  signal: AbortSignal;
  requestId: number;
}

export interface AddressResourceCoordinatorOptions<T> {
  load: (owner: string, context: AddressResourceLoadContext) => Promise<T>;
  normalizeOwner?: (owner: string) => string;
}

export interface AddressResourceRefreshOptions {
  /**
   * `dedupe` shares the current request. `force` supersedes it immediately.
   * `trailing` invalidates it and starts exactly one replacement after it
   * settles, for transports that should not overlap reads.
   */
  mode?: AddressResourceRefreshMode;
}

export type AddressResourceSubscriber<T> = (
  state: AddressResourceState<T>
) => void;

export interface AddressResourceCoordinator<T> {
  getState: () => AddressResourceState<T>;
  subscribe: (subscriber: AddressResourceSubscriber<T>) => () => void;
  setOwner: (owner: string | null | undefined) => AddressResourceState<T>;
  refresh: (options?: AddressResourceRefreshOptions) => Promise<T | null>;
  commitAuthoritative: (owner: string, value: T) => boolean;
  dispose: () => void;
}

interface ActiveRequest<T> {
  owner: string;
  ownerGeneration: number;
  requestId: number;
  controller: AbortController;
  valid: boolean;
  promise: Promise<T | null>;
  resolve: (value: T | null) => void;
}

interface TrailingRequest<T> {
  owner: string;
  ownerGeneration: number;
  valid: boolean;
  promise: Promise<T | null>;
  resolve: (value: T | null) => void;
}

const normalizeAddressOwner = (owner: string) => owner.trim().toLowerCase();

export const shouldHydrateWalletIdentityTransition = (
  incomingOwner: string | null | undefined,
  renderedOwner: string | null | undefined
) => {
  const incoming = incomingOwner ? normalizeAddressOwner(incomingOwner) : null;
  const rendered = renderedOwner ? normalizeAddressOwner(renderedOwner) : null;
  return incoming !== rendered;
};

export const resolveWalletTransitionReloadSafety = (
  identityHydrating: boolean,
  renderedStateIsSafe: boolean
) => identityHydrating ? false : renderedStateIsSafe;

const idleState = <T>(): AddressResourceState<T> => ({
  owner: null,
  status: 'idle',
  value: null,
  hasValue: false,
  error: null,
  busy: false,
  refreshing: false
});

const createPendingPromise = <T>() => {
  let resolve!: (value: T | null) => void;
  const promise = new Promise<T | null>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

/**
 * Coordinates one wallet-address-owned resource without depending on React.
 *
 * The visible value is always tagged with its owner. Changing owner invalidates
 * every outstanding read, including an A -> B -> A transition where comparing
 * only the final address would otherwise let the first A response commit.
 */
export const createAddressResourceCoordinator = <T>({
  load,
  normalizeOwner = normalizeAddressOwner
}: AddressResourceCoordinatorOptions<T>): AddressResourceCoordinator<T> => {
  let state = idleState<T>();
  let ownerGeneration = 0;
  let nextRequestId = 0;
  let activeRequest: ActiveRequest<T> | null = null;
  let trailingRequest: TrailingRequest<T> | null = null;
  let disposed = false;
  const subscribers = new Set<AddressResourceSubscriber<T>>();

  const publish = (nextState: AddressResourceState<T>) => {
    state = nextState;
    for (const subscriber of subscribers) subscriber(state);
  };

  const publishBusy = () => {
    const refreshing = state.hasValue;
    publish({
      ...state,
      status: refreshing ? 'refreshing' : 'loading',
      error: null,
      busy: true,
      refreshing
    });
  };

  const cancelTrailingRequest = () => {
    const trailing = trailingRequest;
    if (!trailing) return;
    trailing.valid = false;
    trailingRequest = null;
    trailing.resolve(null);
  };

  const invalidateActiveRequest = ({
    retainSlot = false
  }: {
    retainSlot?: boolean;
  } = {}) => {
    const request = activeRequest;
    if (!request) return null;
    request.valid = false;
    request.controller.abort();
    if (!retainSlot && activeRequest === request) activeRequest = null;
    return request;
  };

  const invalidateAllReads = () => {
    ownerGeneration += 1;
    invalidateActiveRequest();
    cancelTrailingRequest();
  };

  const isCurrentRequest = (request: ActiveRequest<T>) => (
    !disposed
    && request.valid
    && activeRequest === request
    && request.ownerGeneration === ownerGeneration
    && state.owner === request.owner
  );

  const startRead = (
    owner: string,
    requestOwnerGeneration: number
  ): Promise<T | null> => {
    if (
      disposed
      || state.owner !== owner
      || ownerGeneration !== requestOwnerGeneration
    ) return Promise.resolve(null);

    const pending = createPendingPromise<T>();
    const request: ActiveRequest<T> = {
      owner,
      ownerGeneration: requestOwnerGeneration,
      requestId: nextRequestId + 1,
      controller: new AbortController(),
      valid: true,
      promise: pending.promise,
      resolve: pending.resolve
    };
    nextRequestId = request.requestId;
    activeRequest = request;
    publishBusy();

    const run = async () => {
      try {
        const value = await load(owner, {
          signal: request.controller.signal,
          requestId: request.requestId
        });
        const shouldCommit = isCurrentRequest(request);
        if (activeRequest === request) activeRequest = null;
        if (!shouldCommit) {
          request.resolve(null);
          return;
        }
        publish({
          owner,
          status: 'ready',
          value,
          hasValue: true,
          error: null,
          busy: false,
          refreshing: false
        });
        request.resolve(value);
      } catch (error) {
        const shouldCommit = isCurrentRequest(request);
        if (activeRequest === request) activeRequest = null;
        if (!shouldCommit) {
          request.resolve(null);
          return;
        }
        publish(state.hasValue
          ? {
              ...state,
              status: 'ready',
              error,
              busy: false,
              refreshing: false
            }
          : {
              owner,
              status: 'error',
              value: null,
              hasValue: false,
              error,
              busy: false,
              refreshing: false
            });
        request.resolve(null);
      }
    };

    void run();
    return request.promise;
  };

  const scheduleTrailingRead = (
    owner: string,
    requestOwnerGeneration: number,
    currentRequest: ActiveRequest<T>
  ) => {
    const pending = createPendingPromise<T>();
    const trailing: TrailingRequest<T> = {
      owner,
      ownerGeneration: requestOwnerGeneration,
      valid: true,
      promise: pending.promise,
      resolve: pending.resolve
    };
    trailingRequest = trailing;
    currentRequest.valid = false;
    currentRequest.controller.abort();
    publishBusy();

    void currentRequest.promise.then(() => {
      if (
        disposed
        || !trailing.valid
        || trailingRequest !== trailing
        || state.owner !== owner
        || ownerGeneration !== requestOwnerGeneration
      ) {
        trailing.resolve(null);
        return;
      }
      trailingRequest = null;
      void startRead(owner, requestOwnerGeneration).then(trailing.resolve);
    });

    return trailing.promise;
  };

  const setOwner = (rawOwner: string | null | undefined) => {
    const normalized = rawOwner ? normalizeOwner(rawOwner) : '';
    const owner = normalized || null;
    if (owner === state.owner) return state;
    invalidateAllReads();
    publish(owner
      ? {
          owner,
          status: 'idle',
          value: null,
          hasValue: false,
          error: null,
          busy: false,
          refreshing: false
        }
      : idleState<T>());
    return state;
  };

  const refresh = (
    { mode = 'dedupe' }: AddressResourceRefreshOptions = {}
  ): Promise<T | null> => {
    const owner = state.owner;
    if (disposed || !owner) return Promise.resolve(null);

    if (mode === 'dedupe') {
      if (
        trailingRequest?.valid
        && trailingRequest.owner === owner
        && trailingRequest.ownerGeneration === ownerGeneration
      ) return trailingRequest.promise;
      if (
        activeRequest?.valid
        && activeRequest.owner === owner
        && activeRequest.ownerGeneration === ownerGeneration
      ) return activeRequest.promise;
      return startRead(owner, ownerGeneration);
    }

    if (
      mode === 'trailing'
      && trailingRequest?.valid
      && trailingRequest.owner === owner
      && trailingRequest.ownerGeneration === ownerGeneration
    ) return trailingRequest.promise;

    cancelTrailingRequest();
    const currentRequest = activeRequest;
    if (
      mode === 'trailing'
      && currentRequest?.valid
      && currentRequest.owner === owner
      && currentRequest.ownerGeneration === ownerGeneration
    ) {
      return scheduleTrailingRead(owner, ownerGeneration, currentRequest);
    }

    invalidateActiveRequest();
    return startRead(owner, ownerGeneration);
  };

  const commitAuthoritative = (rawOwner: string, value: T) => {
    if (disposed) return false;
    const owner = normalizeOwner(rawOwner);
    if (!owner || owner !== state.owner) return false;
    invalidateAllReads();
    publish({
      owner,
      status: 'ready',
      value,
      hasValue: true,
      error: null,
      busy: false,
      refreshing: false
    });
    return true;
  };

  const subscribe = (subscriber: AddressResourceSubscriber<T>) => {
    if (disposed) return () => undefined;
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    invalidateAllReads();
    subscribers.clear();
  };

  return {
    getState: () => state,
    subscribe,
    setOwner,
    refresh,
    commitAuthoritative,
    dispose
  };
};
