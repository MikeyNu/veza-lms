"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Button, IconButton } from "./primitives.js";
import { containsRef, cx, focusFirst, trapTabKey, type VezaPlacement, type VezaTone } from "./utilities.js";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      focusFirst(dialog);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className={cx("vz-dialog", `vz-dialog--${size}`, destructive && "vz-dialog--destructive")}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="vz-dialog__frame">
        <header className="vz-dialog__header">
          <div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
          <IconButton label={closeLabel} icon={<span aria-hidden="true">×</span>} onClick={onClose} />
        </header>
        <div className="vz-dialog__body">{children}</div>
        {footer ? <footer className="vz-dialog__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

export interface DrawerProps extends Omit<DialogProps, "size"> {
  readonly placement?: "left" | "right";
  readonly width?: "narrow" | "standard" | "wide";
}

export function Drawer({ placement = "right", width = "standard", ...props }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      dialog.showModal();
      focusFirst(dialog);
    } else if (!props.open && dialog.open) dialog.close();
  }, [props.open]);
  return (
    <dialog
      ref={dialogRef}
      className={cx("vz-drawer", `vz-drawer--${placement}`, `vz-drawer--${width}`)}
      aria-labelledby={titleId}
      aria-describedby={props.description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) props.onClose();
      }}
    >
      <div className="vz-drawer__frame">
        <header className="vz-dialog__header">
          <div><h2 id={titleId}>{props.title}</h2>{props.description ? <p id={descriptionId}>{props.description}</p> : null}</div>
          <IconButton label={props.closeLabel ?? "Close drawer"} icon={<span aria-hidden="true">×</span>} onClick={props.onClose} />
        </header>
        <div className="vz-drawer__body">{props.children}</div>
        {props.footer ? <footer className="vz-dialog__footer">{props.footer}</footer> : null}
      </div>
    </dialog>
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
}: PopoverProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const current = open ?? internal;
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const setOpen = useCallback((next: boolean) => {
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  }, [onOpenChange, open]);
  useEffect(() => {
    if (!current) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containsRef(rootRef, event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [current, setOpen]);
  return (
    <div className="vz-popover" ref={rootRef}>
      <button
        type="button"
        className="vz-popover__trigger"
        aria-haspopup="dialog"
        aria-expanded={current}
        aria-controls={contentId}
        onClick={() => setOpen(!current)}
      >
        {trigger}
      </button>
      {current ? (
        <div
          ref={contentRef}
          id={contentId}
          role="dialog"
          aria-label={label}
          className={cx("vz-popover__content", `vz-popover__content--${placement}`, `vz-popover__content--${align}`)}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            } else trapTabKey(event.nativeEvent, contentRef.current);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
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
    const duration = input.duration ?? 6000;
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss, maximum]);
  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="vz-toast-viewport" aria-label="Notifications">
        {toasts.map((toast) => (
          <section
            key={toast.id}
            className={cx("vz-toast", `vz-toast--${toast.tone ?? "neutral"}`)}
            role={toast.tone === "critical" ? "alert" : "status"}
          >
            <div><strong>{toast.title}</strong>{toast.message ? <p>{toast.message}</p> : null}</div>
            {toast.actionLabel && toast.onAction ? <Button variant="quiet" size="small" onClick={toast.onAction}>{toast.actionLabel}</Button> : null}
            <IconButton label="Dismiss notification" icon={<span aria-hidden="true">×</span>} onClick={() => dismiss(toast.id)} />
          </section>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}

export function OverlayFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("vz-overlay-footer", className)} />;
}
