import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins'

// auth server lives in paycall-server; /api/* rewritten there (next.config)
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ user: { ownerId: { type: 'string', required: false }, sellerId: { type: 'string', required: false } } }),
    emailOTPClient(),
  ],
})
