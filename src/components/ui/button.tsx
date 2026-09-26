import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const styles = cva("inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      primary: "bg-[#006FE6] text-white shadow-sm hover:bg-[#005bbd]",
      secondary: "border border-[#DFE4EB] bg-white text-[#344054] hover:bg-[#F8FAFC]",
      ghost: "text-[#475467] hover:bg-[#F1F5F9] hover:text-[#19191F]",
      danger: "bg-[#D92D20] text-white hover:bg-[#B42318]",
    },
    size: { default: "h-10 px-4", sm: "h-9 px-3", icon: "h-10 w-10 px-0" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { asChild?: boolean };
export function Button({ className, variant, size, asChild, ...props }: Props) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(styles({ variant, size }), className)} {...props} />;
}
