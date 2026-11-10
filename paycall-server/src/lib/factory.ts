import { createFactory } from 'hono/factory'
import type { AppEnv } from '../types'

// createHandlers keeps validator types → c.req.valid() typed in controllers
export const factory = createFactory<AppEnv>()
