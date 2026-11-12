// usage metering for pricing 'token' | 'char'. cost = units × rate, capped at the signed max
export type Unit = 'token' | 'char'

// ponytail: no tokenizer; ≈4 chars/token unless upstream reports usage (openai/anthropic shapes)
const estTokens = (chars: number) => Math.ceil(chars / 4)
const usageTokens = (o: any): number | undefined => {
  const u = o?.usage ?? o?.message?.usage
  const n = u?.output_tokens ?? u?.completion_tokens
  return typeof n === 'number' ? n : undefined
}
// streamed text piece from common sse chunk shapes; raw data if unknown
const chunkText = (o: any, raw: string): string =>
  o?.delta?.text ?? o?.choices?.[0]?.delta?.content ?? o?.choices?.[0]?.text ?? (typeof o?.text === 'string' ? o.text : typeof o?.content === 'string' ? o.content : raw)

export const cost = (units: number, rate: number, max: number) => Math.min(max, units * rate)

// whole body: chars = body length; tokens = reported usage or estimate
export function countBody(body: string, unit: Unit) {
  if (unit === 'char') return body.length
  try {
    const n = usageTokens(JSON.parse(body))
    if (n !== undefined) return n
  } catch {}
  return estTokens(body.length)
}

// sse passthrough: counts text as it flows, stops once cost hits max
// onEnd(units) runs once on upstream end, cut, or client abort; return appended as final sse event
// pull-based source (not TransformStream): cancel() reliably fires on client disconnect → unused cap
// still refunded (x402 upto: settle what was measured). caller keeps onEnd alive via waitUntil
export function meterStream(body: ReadableStream<Uint8Array>, unit: Unit, rate: number, max: number, onEnd: (units: number, cut: boolean) => Promise<string | void>) {
  const reader = body.getReader()
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let buf = ''
  let chars = 0
  let reported: number | undefined
  let cut = false
  let ended: Promise<string | void> | undefined
  const units = () => (unit === 'char' ? chars : (reported ?? estTokens(chars)))
  const finish = () => (ended ??= onEnd(units(), cut))
  const close = async (ctl: ReadableStreamDefaultController<Uint8Array>) => {
    const tail = await finish()
    if (tail) ctl.enqueue(enc.encode(tail))
    ctl.close()
  }
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      // loop until enqueued: pull that enqueues nothing may not be called again
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          if (buf) ctl.enqueue(enc.encode(buf))
          return close(ctl)
        }
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()!
        let out = ''
        for (const line of lines) {
          out += line + '\n'
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          let o: unknown
          try {
            o = JSON.parse(raw)
          } catch {}
          if (raw !== '[DONE]') chars += chunkText(o, raw).length
          reported = usageTokens(o) ?? reported
          if (units() * rate >= max) {
            cut = true
            break
          }
        }
        if (out) ctl.enqueue(enc.encode(out))
        if (cut) {
          ctl.enqueue(enc.encode('\n'))
          reader.cancel().catch(() => {})
          return close(ctl)
        }
        if (out) return
      }
    },
    async cancel(reason) {
      reader.cancel(reason).catch(() => {})
      await finish() // client gone: charge only what streamed
    },
  })
}
