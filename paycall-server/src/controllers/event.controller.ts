import { and, eq, gt, max } from 'drizzle-orm'
import { streamSSE } from 'hono/streaming'
import { entries } from '../db/schema'
import { factory } from '../lib/factory'

// ponytail: 1s db poll per viewer, durable object fan-out if many viewers
export const stream = factory.createHandlers((c) => {
  const db = c.var.db
  const { role, id } = c.var.principal
  const col = role === 'owner' ? entries.ownerId : entries.sellerId

  return streamSSE(c, async (s) => {
    try {
      let last = Number(c.req.header('last-event-id') ?? 0)
      if (!last) {
        // fresh viewer → only new events
        const [r] = await db.select({ top: max(entries.id) }).from(entries).where(eq(col, id))
        last = r?.top ?? 0
      }

      await s.write(': ok\n\n') // flush headers now
      for (let tick = 1; !s.aborted; tick++) {
        if (tick % 15 === 0) await s.write(': ping\n\n') // keepalive → proxies don't drop idle stream
        const rows = await db.select().from(entries).where(and(eq(col, id), gt(entries.id, last))).orderBy(entries.id).limit(100)
        for (const row of rows) {
          last = row.id
          await s.writeSSE({ id: String(row.id), event: row.type, data: JSON.stringify(row) })
        }
        await s.sleep(1000)
      }
    } finally {
      await c.var.closeDb()
    }
  })
})
