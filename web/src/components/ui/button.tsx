import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";

export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button-primary",
      secondary: "ui-button-secondary",
      outline: "ui-button-outline",
      ghost: "ui-button-ghost",
      destructive: "ui-button-destructive",
    },
    size: { default: "", sm: "ui-button-sm", lg: "ui-button-lg", icon: "ui-button-icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export function Button({ className, variant, size, asChild = false, type, ...props }:
  ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component data-slot="button" type={asChild ? undefined : type ?? "button"}
    className={clsx(buttonVariants({ variant, size }), className)} {...props} />;
}