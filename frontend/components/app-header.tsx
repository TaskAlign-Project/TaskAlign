export function AppHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="flex items-center gap-4 border-b px-4 py-2.5 md:px-6 md:py-3 bg-card">
      <div className="flex flex-col">
        <h1 className="text-base font-semibold tracking-tight text-card-foreground">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </header>
  )
}
