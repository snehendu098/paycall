import { Hono } from 'hono'
import * as event from '../controllers/event.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const eventRoute = new Hono<AppEnv>().get('/', auth('owner', 'seller'), ...event.stream)
