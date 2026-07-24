import { forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger";
export type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border border-transparent bg-primary text-primaryForeground hover:bg-primary/90 active:bg-primary/80",
  secondary: "border border-border bg-surface text-foreground hover:bg-muted active:bg-surfaceHover",
  subtle: "border border-transparent bg-transparent text-mutedForeground hover:bg-muted hover:text-foreground",
  danger: "border border-transparent bg-destructive text-primaryForeground hover:bg-destructive/90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-8 gap-2 rounded-md px-3 text-sm",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      className={`inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-45 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {icon && <span aria-hidden="true" className="flex shrink-0 items-center">{icon}</span>}
      {children}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: ButtonSize;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", active = false, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      data-active={active || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-transparent outline-none transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        active ? "bg-primary/10 text-primary" : "text-mutedForeground hover:bg-muted hover:text-foreground"
      } ${size === "sm" ? "h-7 w-7" : "h-8 w-8"} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
