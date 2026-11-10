import { Hono } from 'hono'
import * as oauth from '../controllers/oauth.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

// consent tx api for dashboard bff (/authorize itself mounted at root)
export const oauthRoute = new Hono<AppEnv>()
  .use(auth('owner'))
  .get('/tx/:id', ...oauth.get)
  .post('/tx/:id/complete', ...oauth.complete)
  .post('/tx/:id/deny', ...oauth.deny)
