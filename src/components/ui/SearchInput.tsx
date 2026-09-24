import { type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Style discret (barre laterale) vs encadre (pages). */
  variant?: "ghost" | "outline";
  containerClassName?: string;
}

/** Champ de recherche avec icone loupe. */
export function SearchInput({
  variant = "outline",
  containerClassName,
  className,
  ...props
}: SearchInputProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg text-muted-foreground",
        variant === "outline"
          ? "border border-border bg-card px-3 py-2"
          : "px-1 py-1.5",
        containerClassName,
      )}
    >
      <Search size={16} strokeWidth={1.75} className="shrink-0" />
      <input
        type="text"
        className={cn(
          "w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export default SearchInput;
