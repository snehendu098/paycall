import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { Pool } from 'pg'

const { GOOGLE_CLIENT_ID: gid, GOOGLE_CLIENT_SECRET: gsecret } = process.env
export const googleEnabled = !!(gid && gsecret)

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: { enabled: true },
  socialProviders: googleEnabled ? { google: { clientId: gid!, clientSecret: gsecret! } } : {},
  user: {
    additionalFields: {
      ownerId: { type: 'string', required: false, input: false },
      sellerId: { type: 'string', required: false, input: false },
    },
  },
  plugins: [nextCookies()],
})
