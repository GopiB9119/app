"use client";

import type { ComponentProps } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { clsx } from "clsx";

export const TooltipTrigger = TooltipPrimitive.Trigger;

// Radix refuses to render a tooltip outside a provider; each Tooltip carries its own, so it works on any screen without an app-level wrapper.
export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={100}><TooltipPrimitive.Root {...props} /></TooltipPrimitive.Provider>;
}

export function TooltipContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content data-slot="tooltip-content"
    sideOffset={sideOffset} collisionPadding={12} className={clsx("ui-tooltip", className)} {...props} />
  </TooltipPrimitive.Portal>;
}