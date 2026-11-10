import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins'
import { Pool } from 'pg'

const { RESEND_API_KEY: key, RESEND_FROM: from = 'PayCall <onboarding@resend.dev>' } = process.env

// resend rest api, no sdk. no key → log code (local dev)
async function sendCode(email: string, otp: string) {
  if (!key) return console.log(`[otp] ${email} → ${otp}`)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: email,
      subject: `${otp} is your PayCall code`,
      text: `Your PayCall sign-in code: ${otp}\n\nExpires in 5 minutes. Didn't ask for it? Ignore this email.`,
    }),
  })
  if (!r.ok) console.error('resend failed', r.status, await r.text())
}

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  user: {
    additionalFields: {
      ownerId: { type: 'string', required: false, input: false },
      sellerId: { type: 'string', required: false, input: false },
    },
  },
  // email otp = login + signup in one (unknown email → new user)
  plugins: [emailOTP({ sendVerificationOTP: ({ email, otp }) => sendCode(email, otp) }), nextCookies()],
})
