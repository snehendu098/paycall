import { Hono } from 'hono'
import * as x402 from '../controllers/x402.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const x402Route = new Hono<AppEnv>()
  .get('/supported', ...x402.supported)
  .post('/verify', auth('seller'), ...x402.verify)
  .post('/settle', auth('seller'), ...x402.settle)
  .post('/passes/check', auth('seller'), ...x402.checkPass)
