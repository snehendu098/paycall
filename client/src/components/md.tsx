import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Code } from '@/components/ds'

type Node = { type: string; value?: string; children?: Node[] }
const text = (n?: Node): string => (n?.type === 'text' ? n.value ?? '' : (n?.children ?? []).map(text).join(''))
const list = 'my-3 flex flex-col gap-1.5 pl-5 text-[14px] leading-7 text-foreground/80 marker:text-muted-foreground'

// default react-markdown: no raw html, unsafe urls stripped
const C: Components = {
  h1: ({ children }) => <h2 className="mb-3 mt-8 text-2xl font-light tracking-[-0.02em] first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mb-3 mt-8 text-lg font-normal first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-6 text-[15px] font-normal first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-3 text-[14px] leading-7 text-foreground/80">{children}</p>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">{children}</a>,
  ul: ({ children }) => <ul className={`${list} list-disc`}>{children}</ul>,
  ol: ({ children }) => <ol className={`${list} list-decimal`}>{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l border-foreground/30 pl-4 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-6 border-border" />,
  code: ({ children }) => <code className="border border-border bg-card px-1 py-px font-mono text-[12.5px] text-foreground">{children}</code>,
  pre: ({ node }) => <Code text={text(node?.children[0] as Node).replace(/\n$/, '')} className="my-4 [&_pre]:text-[12.5px]" />,
  table: ({ children }) => <div className="my-4 overflow-x-auto border border-border"><table className="w-full border-collapse text-left text-[13px]">{children}</table></div>,
  th: ({ children }) => <th className="border-b border-border px-3 py-2 font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top text-foreground/80">{children}</td>,
}

/** Seller docs markdown, styled like the docs site. */
export function Md({ children }: { children: string }) {
  if (!children.trim()) return <p className="text-sm text-muted-foreground">No docs yet.</p>
  return <div className="min-w-0 break-words"><Markdown remarkPlugins={[remarkGfm]} components={C}>{children}</Markdown></div>
}
