import { Hono } from 'hono'
import * as endpoint from '../controllers/endpoint.controller'
import { auth } from '../lib/auth'
import type { AppEnv } from '../types'

export const endpointRoute = new Hono<AppEnv>()
  .use(auth('seller'))
  .post('/', ...endpoint.create)
  .get('/', ...endpoint.list)
  .patch('/:id', ...endpoint.update)
  .delete('/:id', ...endpoint.remove)
