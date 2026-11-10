import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { owners } from './owner.schema'

// device login (rfc 8628 style): cli makes key locally, browser approves pubkey
export const deviceLogins = pgTable('device_logins', {
  deviceHash: text().primaryKey(), // sha256(device code), cli secret never stored raw
  userCode: text().notNull().unique(), // typed by user in browser
  pubkey: text().notNull(),
  name: text().notNull(),
  replaces: text(), // old agent pubkey to pause on approve
  ownerId: text().references(() => owners.id), // set on approve
  maxPrice: micros(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
})
