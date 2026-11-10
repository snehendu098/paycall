import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { generateKey } from 'paycall-sdk'

export const API = process.env.PAYCALL_API ?? 'https://paycall-server.silonelabs.workers.dev'
export const KEY_FILE = process.env.PAYCALL_KEY_FILE ?? join(homedir(), '.config', 'paycall', 'agent.json')

type Saved = { privateKey: string; pubkey: string; name: string }

// key file (from login) wins over legacy PAYCALL_AGENT_KEY env → re-login switches wallet w/o editing mcp config
export async function loadKey(): Promise<string | undefined> {
  const saved = await readFile(KEY_FILE, 'utf8').then((s) => JSON.parse(s) as Saved, () => undefined)
  return saved?.privateKey ?? process.env.PAYCALL_AGENT_KEY
}

async function savedPubkey() {
  return readFile(KEY_FILE, 'utf8').then((s) => (JSON.parse(s) as Saved).pubkey, () => undefined)
}

export type Started = { userCode: string; verificationUri: string; done: Promise<'approved' | 'expired'> }

/** Device login: key made here, only pubkey sent; user types userCode at verificationUri to approve. */
export async function login(name = `${hostname().split('.')[0]}-agent`): Promise<Started> {
  const kp = await generateKey()
  const res = await fetch(`${API}/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pubkey: kp.pubkey, name, replaces: await savedPubkey() }),
  })
  if (!res.ok) throw new Error(`login start failed: HTTP ${res.status} ${await res.text()}`)
  const d = (await res.json()) as { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }

  const done = (async () => {
    const until = Date.now() + d.expiresIn * 1000
    while (Date.now() < until) {
      await Bun.sleep(d.interval * 1000)
      const r = await fetch(`${API}/device/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceCode: d.deviceCode }) }).catch(() => null)
      if (!r) continue // network blip → keep polling
      const { status } = (await r.json().catch(() => ({}))) as { status?: string }
      if (status === 'approved') {
        await mkdir(dirname(KEY_FILE), { recursive: true, mode: 0o700 })
        await writeFile(KEY_FILE, JSON.stringify({ ...kp, name } satisfies Saved, null, 2), { mode: 0o600 })
        await chmod(KEY_FILE, 0o600) // writeFile mode ignored if file existed
        return 'approved' as const
      }
      if (status === 'expired') return 'expired' as const
    }
    return 'expired' as const
  })()
  return { userCode: d.userCode, verificationUri: d.verificationUri, done }
}

export const openBrowser = (url: string) => {
  const cmd = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url]
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' })
  } catch {} // headless box → user opens url by hand
}
