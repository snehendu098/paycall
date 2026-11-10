import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import type { makeAuth } from './dashboard'
import type { DB } from './db'

export type Role = 'owner' | 'seller'

export type AppEnv = {
  Bindings: CloudflareBindings & { OAUTH_PROVIDER: OAuthHelpers } // injected by OAuthProvider
  Variables: {
    db: DB
    closeDb: () => Promise<void>
    principal: { role: Role; id: string }
    auth: ReturnType<typeof makeAuth>['auth']
  }
}
