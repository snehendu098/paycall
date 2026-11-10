import { Frame } from '@/components/ds'
import { PortalNav } from '@/components/portal'
import { Toaster } from '@/components/shadcn/sonner'
import { TooltipProvider } from '@/components/shadcn/tooltip'

export default function PortalLayout({ children }: LayoutProps<'/app'>) {
  return (
    <TooltipProvider>
      <Frame nav={<PortalNav />}>{children}</Frame>
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  )
}
