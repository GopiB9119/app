import type { ComponentProps } from "react";

export function Skeleton({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} data-slot="skeleton" aria-hidden="true" className={`ui-skeleton ${className}`} />;
}

export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div className="ui-loading" role="status" aria-label={label} aria-busy="true">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div className="ui-loading-row" key={index} aria-hidden="true">
      <Skeleton className="ui-skeleton-icon" />
      <div className="ui-loading-lines"><Skeleton /><Skeleton className="ui-skeleton-short" /></div>
    </div>)}
  </div>;
}

export function PageSkeleton({ label }: { label: string }) {
  return <main className="route-loading" aria-busy="true">
    <Skeleton className="ui-skeleton-heading" /><LoadingState label={label} rows={4} />
  </main>;
}