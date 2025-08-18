import { GitHubIcon } from './icons'
import { Separator } from './ui/separator'
import { cn } from '@/lib/utils'
import { StarFilledIcon } from '@radix-ui/react-icons'

const REPO_URL = 'https://github.com/e2b-dev/fragments'

export function RepoBanner({ className }: { className?: string }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View Fragments repository on GitHub`}
      className={cn(
        'bg-background overflow-hidden px-3 py-1 rounded-t-2xl',
        'gap-2 flex items-center border border-b-0',
        'transform-y-1 group relative',
        'before:absolute before:inset-0 dark:before:bg-[radial-gradient(circle_at_10%_-50%,rgba(255,255,255,0.1),transparent_10%)] before:rounded-t-2xl before:pointer-events-none',
        className,
      )}
    >



    </a>
  )
}
