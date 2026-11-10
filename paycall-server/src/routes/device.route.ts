import { Hono } from 'hono'
import * as device from '../controllers/device.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

// ponytail: public start/poll unthrottled, add cf rate limit binding if abused
export const deviceRoute = new Hono<AppEnv>()
  .post('/', ...device.start)
  .post('/token', ...device.poll)
  .get('/:code', auth('owner'), ...device.lookup)
  .post('/:code/approve', auth('owner'), ...device.approve)
