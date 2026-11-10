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

// sse passthrough: counts text as it flows, stops forwarding once cost hits max.
// onEnd(units) runs once, on upstream end, cut, or client abort; its return is appended as a final sse event
export function meterStream(unit: Unit, rate: number, max: number, onEnd: (units: number, cut: boolean) => Promise<string | void>) {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let buf = ''
  let chars = 0
  let reported: number | undefined
  let cut = false
  let done = false
  const units = () => (unit === 'char' ? chars : (reported ?? estTokens(chars)))
  const finish = async (ctl?: TransformStreamDefaultController<Uint8Array>) => {
    if (done) return
    done = true
    const tail = await onEnd(units(), cut)
    if (tail && ctl) ctl.enqueue(enc.encode(tail))
  }
  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, ctl) {
      if (cut) return
      buf += dec.decode(chunk, { stream: true })
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
      ctl.enqueue(enc.encode(out))
      if (cut) {
        ctl.enqueue(enc.encode('\n'))
        await finish(ctl)
        ctl.terminate()
      }
    },
    async flush(ctl) {
      if (buf && !cut) ctl.enqueue(enc.encode(buf))
      await finish(ctl)
    },
    async cancel() {
      await finish() // client went away: still settle what was streamed
    },
  })
}
