"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { useRef, type ButtonHTMLAttributes, type Ref } from "react";
import { useHotkey } from "@/lib/hotkeys";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const styles = cva("inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006FE6] disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      primary: "bg-[#006FE6] text-white shadow-sm hover:bg-[#005bbd]",
      secondary: "border border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]",
      ghost: "text-[#475467] hover:bg-[#F1F5F9] hover:text-[#19191F]",
      danger: "bg-[#D92D20] text-white hover:bg-[#B42318]",
      dangerOutline: "border border-[#FDA29B] bg-white text-[#B42318] hover:bg-[#FEF3F2]",
    },
    size: { default: "h-10 px-4", sm: "h-9 px-3", icon: "h-10 w-10 px-0" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & {
  asChild?: boolean;
  /** Keyboard shortcut that activates this button, e.g. "n", "mod+enter", "g b". Shown as a hint on desktop. */
  shortcut?: string;
  /** Let a mod/alt shortcut fire while focus is in a form field (forms and dialogs). */
  shortcutInInput?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ className, variant, size, asChild, shortcut, shortcutInInput, children, ref, ...props }: Props) {
  const Component = asChild ? Slot : "button";
  const localRef = useRef<HTMLButtonElement | null>(null);
  useHotkey(shortcut, () => {
    const el = localRef.current;
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
    if (!el.getClientRects().length) return; // hidden (other tab, collapsed panel)
    el.focus({ preventScroll: true });
    // Menu triggers (Radix) open on keyboard/pointer events, not on click().
    if (el.getAttribute("aria-haspopup")) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    else el.click();
  }, { allowInInput: shortcutInInput, scope: () => localRef.current, enabled: Boolean(shortcut) && !props.disabled });
  const setRef = (node: HTMLButtonElement | null) => {
    localRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
  };
  const hint = shortcut ? <Kbd combo={shortcut} tone={variant === "primary" || variant === "danger" || variant === undefined || variant === null ? "onPrimary" : "default"} className="ml-1" /> : null;
  return (
    <Component
      ref={setRef}
      className={cn(styles({ variant, size }), className)}
      aria-keyshortcuts={shortcut ? toAria(shortcut) : undefined}
      {...props}
    >
      <Slottable>{children}</Slottable>
      {hint}
    </Component>
  );
}

function toAria(combo: string) {
  if (combo.includes(" ")) return undefined;
  return combo.split("+").map(part => part === "mod" ? "Control" : part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)).join("+");
}
