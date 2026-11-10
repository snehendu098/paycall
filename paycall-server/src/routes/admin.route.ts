import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { timingSafeEqual } from 'hono/utils/buffer'
import * as admin from '../controllers/admin.controller'
import type { AppEnv } from '../types'

export const adminRoute = new Hono<AppEnv>()
  .use(bearerAuth<AppEnv>({ verifyToken: (t, c) => !!c.env.ADMIN_KEY && timingSafeEqual(t, c.env.ADMIN_KEY) }))
  .post('/settle-now', ...admin.settleNow)
