import { Hono } from 'hono'
import * as entry from '../controllers/entry.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const entryRoute = new Hono<AppEnv>().get('/', auth('owner', 'seller'), ...entry.list)
