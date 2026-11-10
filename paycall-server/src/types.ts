import type { DB } from './db'

export type Role = 'owner' | 'seller'

export type AppEnv = {
  Bindings: CloudflareBindings
  Variables: {
    db: DB
    closeDb: () => Promise<void>
    principal: { role: Role; id: string }
  }
}
