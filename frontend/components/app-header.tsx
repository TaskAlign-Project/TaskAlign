export function AppHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="flex items-center gap-4 border-b px-4 py-3 md:px-6 md:py-4 bg-card">
      <div className="flex flex-col">
        <h1 className="text-lg font-semibold tracking-tight text-card-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </header>
  )
}
