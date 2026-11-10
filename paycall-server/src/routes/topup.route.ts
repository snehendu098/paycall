import { Hono } from 'hono'
import * as topup from '../controllers/topup.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const topupRoute = new Hono<AppEnv>()
  .use(auth('owner'))
  .post('/create', ...topup.create)
  .post('/capture', ...topup.capture)
