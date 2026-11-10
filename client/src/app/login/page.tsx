import { googleEnabled } from '@/lib/auth'
import { AuthForm } from './form'

export default function Login() {
  return (
    <main>
      <h1>Log in</h1>
      <AuthForm google={googleEnabled} />
      <p>
        No account? <a href="/signup">Sign up</a>
      </p>
    </main>
  )
}
