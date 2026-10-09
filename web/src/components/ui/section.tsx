import type { ComponentProps, ReactNode } from "react";
import { clsx } from "clsx";

export function PageHeader({ title, description, actions, className, ...props }:
  Omit<ComponentProps<"div">, "title"> & { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <div data-slot="page-header" className={clsx("ui-page-header", className)} {...props}>
    <div><h1>{title}</h1>{description && <p className="ui-page-description">{description}</p>}</div>
    {actions && <div className="ui-page-actions">{actions}</div>}
  </div>;
}

// A titled group, announced as a landmark by its heading.
export function Section({ id, title, action, children, className }:
  { id: string; title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section data-slot="section" aria-labelledby={id} className={clsx("ui-section", className)}>
    <div className="ui-section-head"><h2 id={id}>{title}</h2>{action}</div>
    <div className="ui-section-body">{children}</div>
  </section>;
}

export function Empty({ icon, title, children, className }: { icon?: ReactNode; title?: ReactNode; children?: ReactNode; className?: string }) {
  return <div data-slot="empty" className={clsx("ui-empty", className)}>
    {icon && <span className="ui-empty-icon" aria-hidden>{icon}</span>}
    {title && <p className="ui-empty-title">{title}</p>}
    {children && <div>{children}</div>}
  </div>;
}
