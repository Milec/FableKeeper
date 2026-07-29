import type { LucideIcon } from "lucide-react";

/**
 * Consistent page heading: icon + title, optional description, optional actions.
 * Every module page was re-implementing this with slightly different spacing and
 * icon sizes; this keeps them aligned.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
