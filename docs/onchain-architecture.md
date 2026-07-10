# Onchain Architecture

## Authoritative boundaries

**Offchain:** real-time gameplay, score simulation, proposal browsing, current leaderboard, weekly cutoff calculation, anomaly review, and champion claim workflow.

**Onchain:** Mission Record ownership, Champion Record ownership, RSC continue payments, and confirmed funding transactions.

## Verified run lifecycle

1. The server issues a short-lived run ID and signed start token.
2. The client plays without a wallet.
3. At game over, the client submits score metrics and receives a signed receipt.
4. The leaderboard API derives score, wave, and timestamp from the receipt, rejects duplicate run IDs, and stores integrity status.
5. A player may later connect a Base Account and sign a no-spend association message before the receipt expires.

This is server-verifiable, not server-authoritative gameplay. The client can still be modified, so high-value results should remain reviewable and stronger event-stream validation can be added later.

## Mission Record

- One optional ERC-721 per verified run.
- Contains score, wave, date, pilot name, wallet, game version, visual seed, and achievements through metadata.
- Never includes weekly-winner or funding claims.
- Contract prevents duplicate run mints.
- One sponsored mint per wallet per week is the recommended paymaster policy; later mints fall back to player-paid gas.

## Weekly Champion Record

- Created only after the week is finalized and locked.
- Winner must associate the winning receipt with a Base Account and claim within 72 hours.
- Recommended fallback: contact the next eligible verified score in order, with the same claim window, while preserving the original leaderboard result in the public history.
- Proposal selection changes competition status from `finalized` to `claimed`.
- “Funding directed” is only displayed after an allocation transaction hash is confirmed and status becomes `funded`.
- Contract prevents duplicate champion mints per week.

## Contract status

`contracts/SciconRecords.sol` uses EIP-712 authorizations plus independent duplicate guards. It is deployed on Base mainnet at [`0x487a4353A2F83d10d2267DB34CFD9452Eea098AA`](https://basescan.org/address/0x487a4353A2F83d10d2267DB34CFD9452Eea098AA). The verified owner is `0x3A8D692Aabdd4981080a8F6af8375a21359464Bf`, and the verified public authorizer is `0x3BD8E2cD8f5c7F654D3FE9A30fA50b79bb4A9431`. No production paymaster is configured.
