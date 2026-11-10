// AES-GCM for secrets at rest (seller upstream keys). key = sha256("upstream:" + secret)
// ponytail: derived from BETTER_AUTH_SECRET; rotating it orphans sealed values, dedicated KMS key if that matters
const enc = new TextEncoder()
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const key = async (secret: string) =>
  crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(`upstream:${secret}`)), 'AES-GCM', false, ['encrypt', 'decrypt'])

export async function seal(secret: string, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), enc.encode(plain))
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`
}

export async function unseal(secret: string, sealed: string) {
  const [iv, ct] = sealed.split('.').map(unb64)
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await key(secret), ct))
}
