import { factory } from '../lib/factory'
import { settleAll } from '../payouts'

export const settleNow = factory.createHandlers(async (c) => c.json({ batchId: await settleAll(c.env) }))
