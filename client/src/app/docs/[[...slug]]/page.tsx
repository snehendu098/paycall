import type { Metadata } from 'next'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { href, pages } from '../content'
import { Toc } from '../shell'

type Props = PageProps<'/docs/[[...slug]]'>

// every slug prerendered below; unknown slugs 404, so blocking on params is fine
export const instant = false
export const generateStaticParams = () => pages.map((p) => ({ slug: p.slug ? p.slug.split('/') : [] }))

const get = async (params: Props['params']) => {
  const slug = (await params).slug?.join('/') ?? ''
  const i = pages.findIndex((p) => p.slug === slug)
  if (i < 0) notFound()
  return { page: pages[i]!, prev: pages[i - 1], next: pages[i + 1] }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await get(params)
  return {
    title: page.slug ? page.title : { absolute: 'PayCall Docs' },
    description: page.description,
    openGraph: { title: `${page.title} · PayCall Docs`, description: page.description },
  }
}

export default async function DocPage({ params }: Props) {
  const { page, prev, next } = await get(params)
  const headings = page.sections.map(({ id, title }) => ({ id, title }))
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_220px]">
      <article className="mx-auto w-full max-w-[760px] px-4 pb-20 pt-10 sm:px-8 md:pt-14">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{page.group}</div>
        <h1 className="mt-3 text-balance text-[34px] font-light leading-tight tracking-[-0.03em] md:text-[44px]">{page.title}</h1>
        <p className="mt-3 text-pretty text-[17px] leading-7 text-muted-foreground">{page.description}</p>
        {page.intro && <div className="mt-8 flex flex-col gap-5">{page.intro}</div>}
        {page.sections.map((s) => (
          <section key={s.id} className="mt-12 flex flex-col gap-5">
            <h2 id={s.id} className="group scroll-mt-20 border-t border-border pt-8 text-xl tracking-tight">
              <a href={`#${s.id}`}>
                {s.title}
                <span aria-hidden className="ml-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">#</span>
              </a>
            </h2>
            {s.body}
          </section>
        ))}
        <nav aria-label="Pager" className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
          {prev ? <Pager to={prev} dir="Previous" /> : <span className="max-sm:hidden" />}
          {next && <Pager to={next} dir="Next" />}
        </nav>
      </article>
      <aside className="hidden xl:block">
        <div className="sticky top-14 max-h-[calc(100svh-3.5rem)] overflow-y-auto py-14 pr-6">
          <Toc headings={headings} />
        </div>
      </aside>
    </div>
  )
}

function Pager({ to, dir }: { to: (typeof pages)[number]; dir: 'Previous' | 'Next' }) {
  return (
    <Link
      href={href(to.slug)}
      className={`flex flex-col gap-1 border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/40 ${dir === 'Next' ? 'sm:col-start-2 sm:items-end sm:text-right' : ''}`}
    >
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {dir === 'Next' ? <>Next<ArrowRightIcon aria-hidden className="size-3" /></> : <><ArrowLeftIcon aria-hidden className="size-3" />Previous</>}
      </span>
      <span className="text-sm">{to.title}</span>
    </Link>
  )
}
