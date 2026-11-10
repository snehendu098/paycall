import { Hono } from 'hono'
import * as seller from '../controllers/seller.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const sellerRoute = new Hono<AppEnv>()
  .post('/', ...seller.create)
  .get('/me', auth('seller'), ...seller.me)
