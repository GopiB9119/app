import type { ComponentProps } from "react";
import { clsx } from "clsx";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span data-slot="badge" className={clsx("ui-badge", tone !== "neutral" && `ui-badge-${tone}`, className)} {...props} />;
}
