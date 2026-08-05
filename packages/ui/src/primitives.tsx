import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { cx } from "./utilities.js";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
}

export function Button({
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
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx("vz-button", `vz-button--${variant}`, `vz-button--${size}`, className)}
    >
      {loading ? <span className="vz-button__spinner" aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon: ReactNode;
}

export function IconButton({
  label,
  variant = "quiet",
  size = "medium",
  icon,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={props.title ?? label}
      className={cx("vz-icon-button", `vz-button--${variant}`, `vz-button--${size}`, className)}
    >
      {icon}
    </button>
  );
}

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: "default" | "quiet" | "standalone";
  readonly external?: boolean;
}

export function Link({
  variant = "default",
  external = false,
  className,
  children,
  rel,
  target,
  ...props
}: LinkProps) {
  return (
    <a
      {...props}
      className={cx("vz-link", `vz-link--${variant}`, className)}
      target={external ? "_blank" : target}
      rel={external ? "noreferrer noopener" : rel}
    >
      {children}
      {external ? <span className="vz-link__external" aria-hidden="true">↗</span> : null}
    </a>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

export function ButtonLink({
  variant = "primary",
  size = "medium",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      {...props}
      className={cx("vz-button", `vz-button--${variant}`, `vz-button--${size}`, className)}
    >
      <span>{children}</span>
    </a>
  );
}

export function VisuallyHidden({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cx("vz-visually-hidden", className)} />;
}

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
}

export function Kbd({ className, ...props }: KbdProps) {
  return <kbd {...props} className={cx("vz-kbd", className)} />;
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr {...props} className={cx("vz-divider", className)} />;
}

export interface TruncatedTextProps extends HTMLAttributes<HTMLSpanElement> {
  readonly title: string;
}

export function TruncatedText({ title, className, children, ...props }: TruncatedTextProps) {
  return <span {...props} title={title} className={cx("vz-truncate", className)}>{children}</span>;
}
