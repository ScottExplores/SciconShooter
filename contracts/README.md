# Scicon Records

`SciconRecords.sol` defines two separate ERC-721 records:

- **Mission Record:** one optional mint per verified run. It stores a truthful score record and never represents weekly-winner or funding status.
- **Weekly Champion Record:** one mint per finalized week. The backend only authorizes it after the funding transaction is confirmed.

Both mint functions require a short-lived EIP-712 authorization from a server-held authorizer. The contract independently prevents duplicate run and week mints. The frontend remains guest-first; wallet connection is only required to associate a verified receipt and mint.

The contract is prepared for Base Sepolia but has not been deployed. Deployment, production paymaster setup, and any mainnet action require explicit owner approval.

Compile locally with:

```powershell
npm run contract:compile
```
