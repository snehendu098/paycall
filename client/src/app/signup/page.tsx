import { googleEnabled } from '@/lib/auth'
import { AuthForm } from '../login/form'

export default function Signup() {
  return (
    <main>
      <h1>Create account</h1>
      <AuthForm signup google={googleEnabled} />
      <p>
        Have an account? <a href="/login">Log in</a>
      </p>
    </main>
  )
}
