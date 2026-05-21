import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-xl border border-white/10 bg-ink-800 px-3 text-sm placeholder:text-ink-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
      className
    )}
    {...rest}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[88px] w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm placeholder:text-ink-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
      className
    )}
    {...rest}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs uppercase tracking-wider text-ink-500 mb-1.5"
    >
      {children}
    </label>
  );
}
