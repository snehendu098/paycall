import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { timingSafeEqual } from 'hono/utils/buffer'
import * as admin from '../controllers/admin.controller'
import * as d from '../controllers/dispute.controller'
import type { AppEnv } from '../types'

export const adminRoute = new Hono<AppEnv>()
  .use(bearerAuth<AppEnv>({ verifyToken: (t, c) => !!c.env.ADMIN_KEY && timingSafeEqual(t, c.env.ADMIN_KEY) }))
  .post('/settle-now', ...admin.settleNow)
  .get('/stats', ...admin.stats)
  .get('/endpoints', ...admin.listEndpoints)
  .post('/endpoints/:id/verified', ...admin.verify)
  .get('/disputes', ...d.escalated)
  .post('/disputes/:id', ...d.adminDecide)
