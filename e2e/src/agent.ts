// independent impl of voucher wire format → catches server/sdk drift
const SCHEME = 'paycall-prepaid'
const NETWORK = 'paypal:sandbox'
const SIGNED_FIELDS = ['channelId', 'payer', 'payTo', 'cumulativeAmount', 'currency', 'seq', 'expiry']

const b64url = (b: ArrayBuffer) => Buffer.from(b).toString('base64url')

export async function createAgent() {
  const keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
  const pubkey = b64url((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer)
  const channels = new Map<string, { id: string; seq: number; cumulative: number }>()

  // next voucher for seller; commit() only after settle ok
  async function pay(payTo: string, amount: number) {
    const ch = channels.get(payTo) ?? { id: crypto.randomUUID(), seq: 0, cumulative: 0 }
    const next = { ...ch, seq: ch.seq + 1, cumulative: ch.cumulative + amount }
    const v = {
      channelId: next.id,
      payer: pubkey,
      payTo,
      cumulativeAmount: String(next.cumulative),
      currency: 'USD',
      seq: next.seq,
      expiry: Math.floor(Date.now() / 1000) + 300,
    }
    const sig = b64url(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(JSON.stringify(v, SIGNED_FIELDS))))
    const req = { scheme: SCHEME, network: NETWORK, amount: String(amount), asset: 'USD', payTo }
    return {
      body: { x402Version: 2, paymentPayload: { x402Version: 2, accepted: req, payload: { ...v, sig } }, paymentRequirements: req },
      commit: () => channels.set(payTo, next),
    }
  }

  return { pubkey, pay }
}
