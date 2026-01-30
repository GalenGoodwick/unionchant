'use client'

export default function Spinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const dims = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7'
  const border = size === 'sm' ? 'border-2' : 'border-3'

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`${dims} ${border} border-border border-t-accent rounded-full animate-spin`}
      />
      {label && <p className="text-muted text-sm">{label}</p>}
    </div>
  )
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size="lg" label={label} />
    </div>
  )
}
