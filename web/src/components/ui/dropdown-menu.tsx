"use client";

import type { ComponentProps } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content data-slot="dropdown-menu-content"
    sideOffset={sideOffset} collisionPadding={12} className={clsx("ui-menu-content", className)} {...props} />
  </DropdownMenuPrimitive.Portal>;
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" className={clsx("ui-menu-item", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" className={clsx("ui-menu-label", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={clsx("ui-menu-separator", className)} {...props} />;
}