"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Button, IconButton } from "./primitives.js";
import { cx } from "./utilities.js";

export interface FileUploadItem {
  readonly id: string;
  readonly file: File;
  readonly state?: "selected" | "uploading" | "processing" | "ready" | "failed";
  readonly progress?: number;
  readonly error?: string;
}

export interface FileUploadProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  readonly label: string;
  readonly description?: ReactNode;
  readonly items?: readonly FileUploadItem[];
  readonly onFilesSelected: (files: readonly File[]) => void;
  readonly onRemove?: (id: string) => void;
  readonly maximumFiles?: number;
  readonly maximumSizeBytes?: number;
  readonly validateFile?: (file: File) => string | undefined;
  readonly emptyText?: string;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function FileUpload({
  label,
  description,
  items = [],
  onFilesSelected,
  onRemove,
  maximumFiles = 20,
  maximumSizeBytes,
  validateFile,
  emptyText = "Drag files here or choose from your device.",
  accept,
  multiple = true,
  disabled,
  className,
  ...inputProps
}: FileUploadProps) {
  const id = useId().replaceAll(":", "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const remaining = Math.max(0, maximumFiles - items.length);
  const acceptSet = useMemo(() => accept?.split(",").map((value) => value.trim()).filter(Boolean) ?? [], [accept]);

  const select = (files: readonly File[]) => {
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files.slice(0, remaining)) {
      if (maximumSizeBytes && file.size > maximumSizeBytes) {
        rejected.push(`${file.name} is larger than ${formatBytes(maximumSizeBytes)}.`);
        continue;
      }
      if (acceptSet.length > 0) {
        const extension = `.${file.name.split(".").at(-1)?.toLocaleLowerCase() ?? ""}`;
        const acceptedType = acceptSet.some((rule) => rule === file.type || rule === extension || (rule.endsWith("/*") && file.type.startsWith(rule.slice(0, -1))));
        if (!acceptedType) {
          rejected.push(`${file.name} is not an accepted file type.`);
          continue;
        }
      }
      const customError = validateFile?.(file);
      if (customError) rejected.push(`${file.name}: ${customError}`);
      else accepted.push(file);
    }
    if (files.length > remaining) rejected.push(`Only ${remaining} more file${remaining === 1 ? "" : "s"} can be added.`);
    setErrors(rejected);
    if (accepted.length > 0) onFilesSelected(accepted);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) select(Array.from(event.dataTransfer.files));
  };

  return (
    <section className={cx("vz-file-upload", className)} aria-labelledby={`${id}-label`}>
      <header><div><h3 id={`${id}-label`}>{label}</h3>{description ? <p>{description}</p> : null}</div><small>{remaining} remaining</small></header>
      <div
        className={cx("vz-file-upload__dropzone", dragging && "is-dragging", disabled && "is-disabled")}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <input
          {...inputProps}
          ref={inputRef}
          id={`${id}-input`}
          type="file"
          className="vz-visually-hidden"
          accept={accept}
          multiple={multiple}
          disabled={disabled || remaining === 0}
          onChange={(event) => {
            select(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <div aria-hidden="true" className="vz-file-upload__icon">⇧</div>
        <p>{emptyText}</p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled || remaining === 0}>Choose files</Button>
        <small>{accept ? `Accepted: ${accept}` : "All permitted file types"}{maximumSizeBytes ? ` · Maximum ${formatBytes(maximumSizeBytes)} each` : ""}</small>
      </div>
      {errors.length > 0 ? (
        <div className="vz-file-upload__errors" role="alert"><strong>Some files were not added</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
      ) : null}
      {items.length > 0 ? (
        <ul className="vz-file-upload__list" aria-label="Selected files">
          {items.map((item) => (
            <li key={item.id}>
              <div className="vz-file-upload__file-icon" aria-hidden="true">▧</div>
              <div className="vz-file-upload__file-copy">
                <strong>{item.file.name}</strong>
                <span>{formatBytes(item.file.size)} · {item.state ?? "selected"}</span>
                {item.progress !== undefined ? <progress value={item.progress} max={100}>{item.progress}%</progress> : null}
                {item.error ? <small role="alert">{item.error}</small> : null}
              </div>
              {onRemove ? <IconButton label={`Remove ${item.file.name}`} icon={<span aria-hidden="true">×</span>} onClick={() => onRemove(item.id)} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
