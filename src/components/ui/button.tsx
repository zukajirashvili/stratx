import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink shadow-[0_6px_20px_-8px_rgb(255_122_26/0.7)] hover:bg-accent-strong',
        green: 'bg-green text-white hover:bg-green-strong',
        white: 'bg-white text-bg hover:bg-fg-2',
        secondary: 'bg-surface-3 text-fg border border-line-strong hover:bg-line hover:border-faint',
        outline: 'border border-line-strong text-fg hover:bg-surface-2 hover:border-faint',
        ghost: 'text-fg-2 hover:text-fg hover:bg-surface-2',
        danger: 'bg-neg/15 text-neg border border-neg/30 hover:bg-neg/25',
        link: 'text-accent hover:text-accent-strong underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 px-3.5 text-[13px]',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(!asChild ? { type: type ?? 'button' } : {})}
      {...props}
    />
  )
}
