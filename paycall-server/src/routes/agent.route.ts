import { Hono } from 'hono'
import * as agent from '../controllers/agent.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const agentRoute = new Hono<AppEnv>()
  .use(auth('owner'))
  .post('/', ...agent.create)
  .patch('/:pubkey', ...agent.update)
  .delete('/:pubkey', ...agent.remove)
