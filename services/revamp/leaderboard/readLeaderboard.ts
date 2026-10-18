export const LEADERBOARD_READ_TIMEOUT_MS = 8000;

/** The deadline includes JSON body decoding, so the home dashboard can settle offline. */
export const readLeaderboardJson = async (
  url: string,
  timeoutMs = LEADERBOARD_READ_TIMEOUT_MS
): Promise<Record<string, unknown>> => {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Leaderboard request timed out.'));
    }, timeoutMs);
  });
  try {
    const read = async () => {
      const response = await fetch(url, {
        method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw new Error(`Leaderboard fetch failed with ${response.status}`);
      if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
        throw new Error('Leaderboard endpoint did not return JSON');
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Leaderboard endpoint returned an invalid payload');
      }
      return payload as Record<string, unknown>;
    };
    return await Promise.race([read(), deadline]);
  } finally {
    clearTimeout(timeout!);
  }
};
