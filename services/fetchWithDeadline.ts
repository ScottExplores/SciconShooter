export class RequestDeadlineError extends Error {
  constructor(message = 'The request timed out.') {
    super(message);
    this.name = 'RequestDeadlineError';
  }
}

/**
 * Fetch with a real upper bound while preserving caller cancellation. This is
 * used by identity-scoped wallet work so an abandoned account request cannot
 * serialize every later transition behind a never-settling transport.
 */
const runWithFetchDeadline = async <T>(
  init: RequestInit,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const upstreamSignal = init.signal;
  let deadlineReached = false;
  const relayAbort = () => controller.abort(upstreamSignal?.reason);

  if (upstreamSignal?.aborted) {
    relayAbort();
  } else {
    upstreamSignal?.addEventListener('abort', relayAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    deadlineReached = true;
    controller.abort();
  }, Math.max(1, Math.floor(timeoutMs)));

  try {
    return await task(controller.signal);
  } catch (error) {
    if (deadlineReached) {
      throw new RequestDeadlineError('The wallet request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', relayAbort);
  }
};

export const fetchWithDeadline = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000
): Promise<Response> => runWithFetchDeadline(init, timeoutMs, (signal) => fetch(input, {
  ...init,
  signal
}));

export const fetchJsonWithDeadline = async <T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000
): Promise<{ response: Response; payload: T }> => runWithFetchDeadline(
  init,
  timeoutMs,
  async (signal) => {
    const response = await fetch(input, { ...init, signal });
    const payload = await response.json().catch((error) => {
      if (signal.aborted) throw error;
      return {};
    }) as T;
    return { response, payload };
  }
);
