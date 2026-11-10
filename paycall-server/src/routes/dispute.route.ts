import { Hono } from 'hono'
import * as d from '../controllers/dispute.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const disputeRoute = new Hono<AppEnv>().get('/', auth('owner', 'seller'), ...d.list).post('/:id', auth('seller'), ...d.resolve)
