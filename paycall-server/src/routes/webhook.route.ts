import { Hono } from 'hono'
import * as webhook from '../controllers/webhook.controller'
import type { AppEnv } from '../types'

export const webhookRoute = new Hono<AppEnv>().post('/paypal', ...webhook.paypal)
