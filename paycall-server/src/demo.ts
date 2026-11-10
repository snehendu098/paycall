// built-in demo upstream for metered streaming: fake llm, sse word by word. proxy calls it in-process
// (worker can't fetch its own hostname)
import { Hono } from 'hono'

const STORY =
  'An agent woke up with forty cents and a task. It searched the catalog, found a weather API at a tenth of a cent, ' +
  'and paid without asking anyone. Then it found a story stream priced per character and read slowly, ' +
  'because every word had a price and the cap was signed in advance. When the money ran thin it stopped mid sentence, ' +
  'got a refund for the words it never heard, and filed the receipt where any auditor could check the signature.'

export const demo = new Hono().get('/story', (c) => {
  const words = STORY.split(' ')
  const n = Math.min(words.length, Number(c.req.query('words')) || words.length)
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(ctl) {
      for (let i = 0; i < n; i++) {
        ctl.enqueue(enc.encode(`data: ${JSON.stringify({ delta: { text: words[i] + (i < n - 1 ? ' ' : '') } })}\n\n`))
        await new Promise((r) => setTimeout(r, 40))
      }
      ctl.enqueue(enc.encode('data: [DONE]\n\n'))
      ctl.close()
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })
})
