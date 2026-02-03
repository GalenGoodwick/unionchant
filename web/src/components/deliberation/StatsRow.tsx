export default function StatsRow({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  return (
    <div className="flex gap-4 text-sm">
      {items.map((item, i) => (
        <div key={i}>
          <span className="text-muted">{item.label}: </span>
          <span className={`font-mono font-medium ${item.color || 'text-foreground'}`}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}
