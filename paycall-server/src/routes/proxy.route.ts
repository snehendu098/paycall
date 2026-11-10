import { Hono } from 'hono'
import * as proxy from '../controllers/proxy.controller'
import type { AppEnv } from '../types'

export const proxyRoute = new Hono<AppEnv>().all('/:endpointId', ...proxy.forward).all('/:endpointId/*', ...proxy.forward)
