"use client";

import { forwardRef, ElementRef, ComponentPropsWithoutRef } from "react";
import { Root, Image, Fallback } from "@radix-ui/react-avatar";

import { cn } from "$/utils";

const Avatar = forwardRef<
  ElementRef<typeof Root>,
  ComponentPropsWithoutRef<typeof Root>
>(({ className, ...props }, ref) => (
  <Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-md",
      className
    )}
    {...props}
  />
));
Avatar.displayName = Root.displayName;

const AvatarImage = forwardRef<
  ElementRef<typeof Image>,
  ComponentPropsWithoutRef<typeof Image>
>(({ className, alt = "", ...props }, ref) => (
  <Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    alt={alt}
    {...props}
  />
));
AvatarImage.displayName = Image.displayName;

const AvatarFallback = forwardRef<
  ElementRef<typeof Fallback>,
  ComponentPropsWithoutRef<typeof Fallback>
>(({ className, ...props }, ref) => (
  <Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-md bg-muted",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
