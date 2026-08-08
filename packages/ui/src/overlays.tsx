"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as ToastPrimitive from "@radix-ui/react-toast";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { Icon } from "./icons.js";
import { Button, IconButton } from "./primitives.js";
import { cn, type VezaPlacement, type VezaTone } from "./utilities.js";

export interface DialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly size?: "small" | "medium" | "large";
  readonly destructive?: boolean;
}

/**
 * Veza modal dialog backed by Radix focus management, portals and dismissal.
 */
export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = "Close dialog",
  size = "medium",
  destructive = false,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="vz-dialog-overlay" />
        <DialogPrimitive.Content
          className={cn("vz-dialog", `vz-dialog--${size}`, destructive && "vz-dialog--destructive")}
          data-slot="dialog-content"
        >
          <div className="vz-dialog__frame">
            <header className="vz-dialog__header">
              <div className="vz-dialog__heading">
                <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
                {description ? <DialogPrimitive.Description>{description}</DialogPrimitive.Description> : null}
              </div>
              <DialogPrimitive.Close asChild>
                <IconButton label={closeLabel} icon={<Icon name="close" />} />
              </DialogPrimitive.Close>
            </header>
            <div className="vz-dialog__body">{children}</div>
            {footer ? <footer className="vz-dialog__footer">{footer}</footer> : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface DrawerProps extends Omit<DialogProps, "size"> {
  readonly placement?: "left" | "right";
  readonly width?: "narrow" | "standard" | "wide";
}

/**
 * Side sheet for sustained contextual work. It intentionally shares Radix
 * Dialog mechanics instead of maintaining a second focus-management system.
 */
export function Drawer({ placement = "right", width = "standard", ...props }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="vz-drawer-overlay" />
        <DialogPrimitive.Content
          className={cn("vz-drawer", `vz-drawer--${placement}`, `vz-drawer--${width}`)}
          data-slot="drawer-content"
        >
          <div className="vz-drawer__frame">
            <header className="vz-dialog__header">
              <div className="vz-dialog__heading">
                <DialogPrimitive.Title>{props.title}</DialogPrimitive.Title>
                {props.description ? <DialogPrimitive.Description>{props.description}</DialogPrimitive.Description> : null}
              </div>
              <DialogPrimitive.Close asChild>
                <IconButton label={props.closeLabel ?? "Close drawer"} icon={<Icon name="close" />} />
              </DialogPrimitive.Close>
            </header>
            <div className="vz-drawer__body">{props.children}</div>
            {props.footer ? <footer className="vz-dialog__footer">{props.footer}</footer> : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface PopoverProps {
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly label: string;
  readonly placement?: VezaPlacement;
  readonly align?: "start" | "center" | "end";
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly modal?: boolean;
}

export function Popover({
  trigger,
  children,
  label,
  placement = "bottom",
  align = "start",
  open,
  defaultOpen = false,
  onOpenChange,
  modal = false,
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
    >
      <PopoverPrimitive.Trigger className="vz-popover__trigger" data-slot="popover-trigger">
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={placement}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className={cn("vz-popover__content", `vz-popover__content--${placement}`, `vz-popover__content--${align}`)}
          data-slot="popover-content"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export interface TooltipProviderProps {
  readonly children: ReactNode;
  readonly delayDuration?: number;
  readonly skipDelayDuration?: number;
}

export function TooltipProvider({ children, delayDuration = 450, skipDelayDuration = 250 }: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  readonly trigger: ReactElement;
  readonly content: ReactNode;
  readonly placement?: VezaPlacement;
  readonly delayDuration?: number;
}

export function Tooltip({ trigger, content, placement = "top", delayDuration }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={placement}
          sideOffset={6}
          collisionPadding={8}
          className="vz-tooltip"
          data-slot="tooltip-content"
        >
          {content}
          <TooltipPrimitive.Arrow className="vz-tooltip__arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export type DropdownMenuEntry =
  | {
      readonly type?: "item";
      readonly key: string;
      readonly label: ReactNode;
      readonly icon?: ReactNode;
      readonly shortcut?: string;
      readonly disabled?: boolean;
      readonly destructive?: boolean;
      readonly onSelect: () => void;
    }
  | {
      readonly type: "separator";
      readonly key: string;
    }
  | {
      readonly type: "label";
      readonly key: string;
      readonly label: ReactNode;
    };

export interface DropdownMenuProps {
  readonly trigger: ReactElement;
  readonly entries: readonly DropdownMenuEntry[];
  readonly label: string;
  readonly align?: "start" | "center" | "end";
  readonly placement?: VezaPlacement;
}

export function DropdownMenu({ trigger, entries, label, align = "end", placement = "bottom" }: DropdownMenuProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          side={placement}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className="vz-dropdown-menu"
          data-slot="dropdown-menu-content"
        >
          {entries.map((entry) => {
            if (entry.type === "separator") {
              return <DropdownMenuPrimitive.Separator key={entry.key} className="vz-dropdown-menu__separator" />;
            }
            if (entry.type === "label") {
              return <DropdownMenuPrimitive.Label key={entry.key} className="vz-dropdown-menu__label">{entry.label}</DropdownMenuPrimitive.Label>;
            }
            return (
              <DropdownMenuPrimitive.Item
                key={entry.key}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
                className="vz-dropdown-menu__item"
                data-destructive={entry.destructive || undefined}
              >
                {entry.icon ? <span className="vz-dropdown-menu__icon" aria-hidden="true">{entry.icon}</span> : null}
                <span className="vz-dropdown-menu__copy">{entry.label}</span>
                {entry.shortcut ? <span className="vz-dropdown-menu__shortcut" aria-hidden="true">{entry.shortcut}</span> : null}
              </DropdownMenuPrimitive.Item>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export interface AlertDialogProps {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly confirmLabel: ReactNode;
  readonly cancelLabel?: ReactNode;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly destructive?: boolean;
  readonly loading?: boolean;
  readonly children?: ReactNode;
}

export function AlertDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
  destructive = false,
  loading = false,
  children,
}: AlertDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="vz-dialog-overlay" />
        <AlertDialogPrimitive.Content className={cn("vz-dialog", "vz-dialog--small", destructive && "vz-dialog--destructive")}>
          <div className="vz-dialog__frame">
            <header className="vz-dialog__header">
              <div className="vz-dialog__heading">
                <AlertDialogPrimitive.Title>{title}</AlertDialogPrimitive.Title>
                <AlertDialogPrimitive.Description>{description}</AlertDialogPrimitive.Description>
              </div>
            </header>
            {children ? <div className="vz-dialog__body">{children}</div> : null}
            <footer className="vz-dialog__footer">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="secondary">{cancelLabel}</Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button variant={destructive ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
                  {confirmLabel}
                </Button>
              </AlertDialogPrimitive.Action>
            </footer>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export interface ToastInput {
  readonly title: string;
  readonly message?: string;
  readonly tone?: VezaTone;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly duration?: number;
}

interface ToastRecord extends ToastInput {
  readonly id: string;
}

interface ToastContextValue {
  readonly notify: (toast: ToastInput) => string;
  readonly dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children, maximum = 4 }: { readonly children: ReactNode; readonly maximum?: number }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const notify = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID();
    const record: ToastRecord = { ...input, id };
    setToasts((current) => [...current, record].slice(-maximum));
    return id;
  }, [maximum]);
  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            open
            duration={toast.duration && toast.duration > 0 ? toast.duration : toast.duration === 0 ? 2_147_483_647 : 6000}
            onOpenChange={(next) => { if (!next) dismiss(toast.id); }}
            className={cn("vz-toast", `vz-toast--${toast.tone ?? "neutral"}`)}
            data-slot="toast"
          >
            <div className="vz-toast__copy">
              <ToastPrimitive.Title>{toast.title}</ToastPrimitive.Title>
              {toast.message ? <ToastPrimitive.Description>{toast.message}</ToastPrimitive.Description> : null}
            </div>
            {toast.actionLabel && toast.onAction ? (
              <ToastPrimitive.Action altText={toast.actionLabel} asChild>
                <Button variant="quiet" size="small" onClick={toast.onAction}>{toast.actionLabel}</Button>
              </ToastPrimitive.Action>
            ) : null}
            <ToastPrimitive.Close asChild>
              <IconButton label="Dismiss notification" icon={<Icon name="close" />} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="vz-toast-viewport" aria-label="Notifications" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}

export function OverlayFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("vz-overlay-footer", className)} />;
}
