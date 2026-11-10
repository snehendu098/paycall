import { Hono } from 'hono'
import * as approval from '../controllers/approval.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const approvalRoute = new Hono<AppEnv>().use(auth('owner')).get('/', ...approval.list).post('/:id', ...approval.decide)
