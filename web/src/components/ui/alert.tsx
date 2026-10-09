import type { ComponentProps } from "react";
import { clsx } from "clsx";

type AlertTone = "neutral" | "success" | "warning" | "error";

// Errors interrupt screen readers; every other tone is announced politely.
export function Alert({ tone = "neutral", className, ...props }: ComponentProps<"div"> & { tone?: AlertTone }) {
  return <div data-slot="alert" role={tone === "error" ? "alert" : "status"}
    className={clsx("ui-alert", tone !== "neutral" && `ui-alert-${tone}`, className)} {...props} />;
}
