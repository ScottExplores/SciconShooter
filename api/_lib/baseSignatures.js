let baseClientPromise;

const normalizeSignature = (value) => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value.signature || value.result || '';
};

const getBaseClient = async () => {
  if (!baseClientPromise) {
    baseClientPromise = Promise.all([
      import('viem'),
      import('viem/chains')
    ]).then(([{ createPublicClient, http }, { base }]) => createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
    }));
  }
  return baseClientPromise;
};

const verifyMessageWithClient = async (client, { address, message, signature }) => {
  const normalizedSignature = normalizeSignature(signature);
  if (!/^0x[0-9a-f]+$/i.test(normalizedSignature) || normalizedSignature.length % 2 !== 0) return false;
  return client.verifyMessage({
    address,
    message,
    signature: normalizedSignature
  });
};

const verifyBaseMessage = async (payload) => verifyMessageWithClient(await getBaseClient(), payload);

module.exports = { normalizeSignature, verifyBaseMessage, verifyMessageWithClient };
