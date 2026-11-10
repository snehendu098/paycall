import { sql, type AnyColumn } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import * as schema from './schema'

export type DB = NodePgDatabase<typeof schema>

// hyperdrive pools → new client per request is cheap
export async function connect(connectionString: string) {
  const client = new Client({ connectionString })
  await client.connect()
  return { db: drizzle({ client, schema, casing: 'snake_case' }), close: () => client.end() }
}

export async function withDb<T>(connectionString: string, fn: (db: DB) => Promise<T>) {
  const { db, close } = await connect(connectionString)
  try {
    return await fn(db)
  } finally {
    await close()
  }
}

export const sumMicros = (col: AnyColumn) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number)
