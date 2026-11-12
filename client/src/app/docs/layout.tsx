import type { Metadata } from 'next'
import { groups, href } from './content'
import { DocsShell, type Index } from './shell'

export const metadata: Metadata = { title: { template: '%s · PayCall Docs', default: 'PayCall Docs' } }

// sidebar + search get titles/headings only
const index: Index = groups.map((g) => ({
  title: g.title,
  pages: g.pages.map((p) => ({ href: href(p.slug), title: p.title, description: p.description, headings: p.sections.map(({ id, title }) => ({ id, title })) })),
}))

export default function DocsLayout({ children }: LayoutProps<'/docs'>) {
  return <DocsShell index={index}>{children}</DocsShell>
}
