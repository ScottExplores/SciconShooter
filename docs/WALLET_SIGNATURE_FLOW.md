# Wallet signature flow

Audited: 2026-07-28

## What the prompts are

SciCon Shooter uses **offchain message signatures**, not gas-paying transactions, for the flows described here. The signed messages prove control of a Base Account address. They do not transfer funds, mint, or submit an onchain transaction.

## Wallet-profile authentication

- Trigger: the player explicitly connects a wallet and chooses to synchronize the wallet-bound profile when this device has no matching valid session.
- Proof: a server-issued, single-use nonce and an expiring message are signed by the requested wallet.
- Session: successful verification creates an `HttpOnly`, `Secure`, `SameSite=Lax`, wallet-bound cookie valid for 30 days.
- Purpose: cross-device load/save of Campaign, Hangar, Boss Archive, upgrades, supports, and other durable wallet-profile state.
- Reuse: the client checks the current session before requesting another signature. Routine wallet disconnect no longer deletes the authenticated device session.
- Expected new prompt: a new browser/device, an expired session, a different wallet, or an explicit future “forget this device” action.

## Weekly score submission

- Guest and wallet-connected players both use the server-issued run receipt.
- Guest submissions do not require a wallet or signature.
- The run-start token binds the exact active Weekly route/score prefix and a hashed profile identity; later proof cannot rewrite that prefix.
- If a valid wallet-profile session is already present when the run starts, the receipt is bound to that wallet/profile and finalization requires the same protected session. No new signature prompt is introduced.
- Wallet attribution is accepted only from the verified wallet-profile session. A request-body address is never trusted and cannot impersonate another wallet.
- The server still validates the signed run receipt, competition week, duplicate run ID, graph/event order, authored outcome limits, and recomputed score metrics before saving.

## Proposal browsing and selection

- Browsing proposals, opening the leaderboard, viewing a profile, or changing a Campaign node does not request a signature.
- A guest weekly leader may choose a proposal without a wallet signature under the existing leaderboard rules.
- A wallet-attributed weekly leader must prove the same wallet controls the winning entry.
- The server now reuses a matching, valid wallet-profile session for proposal selection. This removes the former second signature sheet on the same authenticated device.
- If no matching session exists, selection falls back to a ten-minute, single-use proposal challenge. Its message identifies the run, score, Wave, wallet, proposal, challenge, and expiry. The message explicitly states that it does not send funds or mint.
- A stale challenge may be replaced once; a rejected wallet signature is never automatically retried.

## Weekly prize claim

Prize ownership is a separate high-value action. The existing claim flow may require its own server challenge and wallet proof at the claim/verification boundary. That requirement is intentionally not moved into ordinary guest play or proposal browsing.

## Security boundary

The wallet-profile session proves wallet identity and enables secure cross-device synchronization, but Campaign gameplay remains client-simulated. Profile snapshots are sanitized and revision-merged rather than server-replayed. Weekly leaderboard submissions therefore retain the stronger server-issued run receipt, start-prefix and revision binding, strict route/event ordering, timing/rate and authored-aggregate checks, duplicate protection, week binding, and verified wallet attribution. Guest Pilot IDs are device-local identifiers rather than cryptographic identity, and legacy database-reissued receipts may omit newer identity/prefix summary fields. This is practical integrity hardening, not tournament-grade authoritative anti-cheat.
