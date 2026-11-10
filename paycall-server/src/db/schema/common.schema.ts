import { bigint, timestamp } from 'drizzle-orm/pg-core'

// money = integer micros, $9B safe in js number
export const micros = () => bigint({ mode: 'number' })
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
