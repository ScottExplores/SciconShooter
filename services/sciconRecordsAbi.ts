export const sciconRecordsAbi = [{
  type: 'function',
  name: 'mintMissionRecord',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'runId', type: 'bytes32' },
    { name: 'score', type: 'uint256' },
    { name: 'wave', type: 'uint256' },
    { name: 'visualSeed', type: 'uint256' },
    { name: 'tokenUri', type: 'string' },
    { name: 'expiresAt', type: 'uint256' },
    { name: 'signature', type: 'bytes' }
  ],
  outputs: [{ name: 'tokenId', type: 'uint256' }]
}] as const;
