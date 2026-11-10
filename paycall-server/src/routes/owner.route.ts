import { Hono } from 'hono'
import * as owner from '../controllers/owner.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const ownerRoute = new Hono<AppEnv>()
  .post('/', ...owner.create)
  .get('/me', auth('owner'), ...owner.me)
  .patch('/me', auth('owner'), ...owner.update)
