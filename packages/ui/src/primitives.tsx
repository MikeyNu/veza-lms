import { cva } from "class-variance-authority";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Icon } from "./icons.js";
import { cn } from "./utilities.js";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "small" | "medium" | "large";

const buttonVariants = cva("vz-button", {
  variants: {
    variant: {
      primary: "vz-button--primary",
      secondary: "vz-button--secondary",
      quiet: "vz-button--quiet",
      danger: "vz-button--danger",
    },
    size: {
      small: "vz-button--small",
      medium: "vz-button--medium",
      large: "vz-button--large",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "medium",
  },
});

function ButtonIconSlot({ children, position }: { readonly children: ReactNode; readonly position: "leading" | "trailing" }) {
  return (
    <span className="vz-button__icon" data-position={position} aria-hidden="true">
      {children}
    </span>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
}

/**
 * Primary Veza action control.
 *
 * Icon and label boxes are deliberately separated so SVG view boxes cannot
 * move the text baseline or alter control height. Route-level icon margins are
 * not part of the component contract.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "medium",
    loading = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-slot="button"
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {loading ? (
        <span className="vz-button__spinner" aria-hidden="true" />
      ) : leadingIcon ? (
        <ButtonIconSlot position="leading">{leadingIcon}</ButtonIconSlot>
      ) : null}
      <span className="vz-button__label">{children}</span>
      {!loading && trailingIcon ? <ButtonIconSlot position="trailing">{trailingIcon}</ButtonIconSlot> : null}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon: ReactNode;
  readonly loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    variant = "quiet",
    size = "medium",
    icon,
    loading = false,
    className,
    type = "button",
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-label={label}
      aria-busy={loading || undefined}
      data-slot="icon-button"
      data-loading={loading || undefined}
      className={cn("vz-icon-button", `vz-button--${variant}`, `vz-button--${size}`, className)}
    >
      {loading ? (
        <span className="vz-button__spinner" aria-hidden="true" />
      ) : (
        <span className="vz-icon-button__icon" aria-hidden="true">{icon}</span>
      )}
    </button>
  );
});

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: "default" | "quiet" | "standalone";
  readonly external?: boolean;
}

function secureExternalRel(rel: string | undefined): string {
  return Array.from(new Set([...(rel?.split(/\s+/).filter(Boolean) ?? []), "noreferrer", "noopener"])).join(" ");
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    variant = "default",
    external = false,
    className,
    children,
    rel,
    target,
    ...props
  },
  ref,
) {
  return (
    <a
      {...props}
      ref={ref}
      className={cn("vz-link", `vz-link--${variant}`, className)}
      target={external ? "_blank" : target}
      rel={external ? secureExternalRel(rel) : rel}
      data-slot="link"
    >
      <span className="vz-link__label">{children}</span>
      {external ? (
        <span className="vz-link__external" aria-hidden="true">
          <Icon name="external-link" size="small" />
        </span>
      ) : variant === "standalone" ? (
        <span className="vz-link__standalone-icon" aria-hidden="true">
          <Icon name="arrow" size="small" />
        </span>
      ) : null}
    </a>
  );
});

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  {
    variant = "primary",
    size = "medium",
    leadingIcon,
    trailingIcon,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <a
      {...props}
      ref={ref}
      data-slot="button-link"
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {leadingIcon ? <ButtonIconSlot position="leading">{leadingIcon}</ButtonIconSlot> : null}
      <span className="vz-button__label">{children}</span>
      {trailingIcon ? <ButtonIconSlot position="trailing">{trailingIcon}</ButtonIconSlot> : null}
    </a>
  );
});

export const VisuallyHidden = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function VisuallyHidden(
  { className, ...props },
  ref,
) {
  return <span {...props} ref={ref} className={cn("vz-visually-hidden", className)} />;
});

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
}

export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({ className, ...props }, ref) {
  return <kbd {...props} ref={ref} className={cn("vz-kbd", className)} />;
});

export const Divider = forwardRef<HTMLHRElement, HTMLAttributes<HTMLHRElement>>(function Divider(
  { className, ...props },
  ref,
) {
  return <hr {...props} ref={ref} className={cn("vz-divider", className)} />;
});

export interface TruncatedTextProps extends HTMLAttributes<HTMLSpanElement> {
  readonly title: string;
}

export const TruncatedText = forwardRef<HTMLSpanElement, TruncatedTextProps>(function TruncatedText(
  { title, className, children, ...props },
  ref,
) {
  return <span {...props} ref={ref} title={title} className={cn("vz-truncate", className)}>{children}</span>;
});
