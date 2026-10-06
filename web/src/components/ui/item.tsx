import type { ComponentProps } from "react";
import { clsx } from "clsx";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function ItemGroup({ className, ...props }: ComponentProps<"ul">) {
  return <ul data-slot="item-group" className={clsx("ui-list", className)} {...props} />;
}

export function Item({ tone, className, ...props }: ComponentProps<"li"> & { tone?: "warning" | "success" | "danger" }) {
  return <li data-slot="item" data-tone={tone} className={clsx("ui-list-item", className)} {...props} />;
}

export function ItemLeading({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-leading" className={clsx("ui-list-leading", className)} {...props} />;
}

export function ItemContent({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="item-content" className={clsx("ui-list-text", className)} {...props} />;
}

export function ItemTitle({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="item-title" className={clsx("ui-list-title", className)} {...props} />;
}

export function ItemDescription({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="item-description" className={clsx("ui-list-description", className)} {...props} />;
}

// The link stretches over its whole row, so the entire row is one touch target.
export function ItemLink({ className, children, ...props }: ComponentProps<typeof Link>) {
  return <Link data-slot="item-link" className={clsx("ui-list-link", className)} {...props}>{children}<ChevronRight aria-hidden /></Link>;
}
