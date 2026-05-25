import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className combiner (shadcn/ui convention, §1). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
