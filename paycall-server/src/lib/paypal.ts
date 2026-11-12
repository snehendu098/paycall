type Env = CloudflareBindings

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`paypal ${status}: ${JSON.stringify(body)}`)
  }
}

export type Capture = { id: string; status: string; amount: { value: string } }

export type Order = {
  id: string
  status: string
  purchase_units: { payments?: { captures?: Capture[] } }[]
  payment_source?: { paypal?: { email_address?: string; attributes?: { vault?: { id?: string; status?: string; customer?: { id?: string } } } } }
}

const TOKEN_KEY = 'paypal:token'

async function token(env: Env) {
  const cached = await env.KV.get(TOKEN_KEY)
  if (cached) return cached

  const res = await fetch(`${env.PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new PayPalError(res.status, await res.text())

  const { access_token, expires_in } = await res.json<{ access_token: string; expires_in: number }>()
  await env.KV.put(TOKEN_KEY, access_token, { expirationTtl: Math.max(60, expires_in - 300) })
  return access_token
}

// requestId → PayPal-Request-Id idempotency
export async function paypal<T>(env: Env, method: 'GET' | 'POST', path: string, body?: unknown, requestId?: string) {
  const res = await fetch(`${env.PAYPAL_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await token(env)}`,
      'content-type': 'application/json',
      ...(requestId && { 'paypal-request-id': requestId }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new PayPalError(res.status, data)
  return data as T
}

export async function verifyWebhook(env: Env, header: (name: string) => string | undefined, event: unknown) {
  const sig = {
    auth_algo: header('paypal-auth-algo'),
    cert_url: header('paypal-cert-url'),
    transmission_id: header('paypal-transmission-id'),
    transmission_sig: header('paypal-transmission-sig'),
    transmission_time: header('paypal-transmission-time'),
  }
  // missing headers → not from paypal, reject without api call
  if (Object.values(sig).some((v) => !v)) return false
  const res = await paypal<{ verification_status: string }>(env, 'POST', '/v1/notifications/verify-webhook-signature', {
    ...sig,
    webhook_id: env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  }).catch((e) => {
    // malformed sig headers → paypal 400 → forged, not our error
    if (e instanceof PayPalError && e.status === 400) return { verification_status: 'FAILURE' }
    throw e
  })
  return res.verification_status === 'SUCCESS'
}
