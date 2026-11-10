import { Hono } from 'hono'
import * as d from '../controllers/dispute.controller'
import * as entry from '../controllers/entry.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const entryRoute = new Hono<AppEnv>()
  .get('/', auth('owner', 'seller'), ...entry.list)
  .post('/:id/refund', auth('seller'), ...d.refundCharge)
  .post('/:id/dispute', auth('owner'), ...d.dispute)
