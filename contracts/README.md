# Scicon Records

`SciconRecords.sol` defines two separate ERC-721 records:

- **Mission Record:** one optional mint per verified run. It stores a truthful score record and never represents weekly-winner or funding status.
- **Weekly Champion Record:** one mint per finalized week. The backend only authorizes it after the funding transaction is confirmed.

Both mint functions require a short-lived EIP-712 authorization from a server-held authorizer. The contract independently prevents duplicate run and week mints. The frontend remains guest-first; wallet connection is only required to associate a verified receipt and mint.

## Base mainnet deployment

- Contract: [`0x487a4353A2F83d10d2267DB34CFD9452Eea098AA`](https://basescan.org/address/0x487a4353A2F83d10d2267DB34CFD9452Eea098AA)
- Deployment transaction: [`0xd2c49d5944303cf2a30200476645a7cf5428c8c81e569c8414b0afa59f2625b5`](https://basescan.org/tx/0xd2c49d5944303cf2a30200476645a7cf5428c8c81e569c8414b0afa59f2625b5)
- Chain ID: `8453`

The deployed contract's owner and authorizer were read back from Base after deployment. Production paymaster setup and future mainnet actions still require explicit owner approval.

Compile locally with:

```powershell
npm run contract:compile
```
