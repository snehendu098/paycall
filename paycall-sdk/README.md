# paycall-sdk

Agent-side client for PayCall (x402 v2, scheme `paycall-prepaid`). `agent.fetch` is a drop-in `fetch` that pays HTTP 402s from the owner's prepaid PayCall balance by signing cumulative Ed25519 vouchers.

## Install

```sh
bun add file:../paycall-sdk   # path to this folder
```

## Usage

```ts
import { createAgent, decodePaymentHeader, generateKey } from 'paycall-sdk'

const { privateKey, pubkey } = await generateKey() // register pubkey under owner (dashboard → Buyer → Add agent)
const agent = await createAgent(privateKey)
const res = await agent.fetch('https://api.paycall.live/p/<endpointId>/...')
if (res.status === 402) console.log('not paid:', decodePaymentHeader(res.headers.get('payment-required'))?.error)
else console.log(await res.json(), `spent $${agent.spent / 1e6}`)
```

API: `generateKey()`, `createAgent(privateKey) → { pubkey, fetch, spent }` (spent = micros this session), `decodePaymentHeader(h)`.

Test (live server, creates throwaway owner/seller/endpoint): `bun test`.
