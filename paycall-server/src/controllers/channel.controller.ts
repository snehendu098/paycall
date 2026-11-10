import { and, eq } from 'drizzle-orm'
import { channels } from '../db/schema'
import { factory } from '../lib/factory'

// ponytail: pubkey-scoped public read, require signed request if privacy matters
export const get = factory.createHandlers(async (c) => {
  const [ch] = await c.var.db
    .select({ channelId: channels.id, seq: channels.seq, cumulative: channels.cumulative })
    .from(channels)
    .where(and(eq(channels.agentPubkey, c.req.param('pubkey')!), eq(channels.sellerId, c.req.param('sellerId')!)))
  return ch ? c.json(ch) : c.json({ error: 'no_channel' }, 404)
})
