// bun has no workerd runtime: stub `cloudflare:workers` so oauth/agents libs import
import { mock } from 'bun:test'
class Stub {}
mock.module('cloudflare:workers', () => ({ WorkerEntrypoint: Stub, DurableObject: Stub, RpcTarget: Stub, WorkflowEntrypoint: Stub, WorkflowEvent: Stub, exports: {}, env: {} }))
