import { Hono } from 'hono'
import * as channel from '../controllers/channel.controller'
import type { AppEnv } from '../types'

export const channelRoute = new Hono<AppEnv>().get('/:pubkey/:sellerId', ...channel.get)
