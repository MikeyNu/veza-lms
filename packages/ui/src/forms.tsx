"use client";

import {
  Children,
  cloneElement,
  useEffect,
  useId,
  useRef,
  type FieldsetHTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx, joinIds } from "./utilities.js";

interface DescribedControlProps {
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  readonly "aria-errormessage"?: string;
}

export interface FieldProps {
  readonly label: ReactNode;
  readonly children: ReactElement<DescribedControlProps>;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly className?: string;
  readonly labelClassName?: string;
}

export function Field({
  label,
  children,
  description,
  error,
  className,
  labelClassName,
}: FieldProps) {
  const generatedId = useId();
  const controlId = children.props.id ?? `vz-field-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = joinIds(children.props["aria-describedby"], descriptionId, errorId);
  const invalid = error ? true : children.props["aria-invalid"];
  const errorMessage = errorId ?? children.props["aria-errormessage"];
  const control = cloneElement(children, {
    id: controlId,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(invalid !== undefined ? { "aria-invalid": invalid } : {}),
    ...(errorMessage ? { "aria-errormessage": errorMessage } : {}),
  });

  return (
    <div className={cx("vz-field", Boolean(error) && "vz-field--invalid", className)}>
      <label className={cx("vz-field__label", labelClassName)} htmlFor={controlId}>
        <span>{label}</span>
      </label>
      {control}
      {description ? <div id={descriptionId} className="vz-field__description">{description}</div> : null}
      {error ? <div id={errorId} className="vz-field__error" role="alert">{error}</div> : null}
    </div>
  );
}

export interface OptionalFieldProps extends FieldProps {
  readonly optionalText?: string;
}

export function OptionalField({ optionalText = "Optional", label, ...props }: OptionalFieldProps) {
  return <Field {...props} label={<>{label}<span className="vz-field__optional">{optionalText}</span></>} />;
}

export interface FieldGroupProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  readonly legend: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
}

export function FieldGroup({ legend, description, error, className, children, ...props }: FieldGroupProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      {...props}
      aria-describedby={joinIds(props["aria-describedby"], descriptionId, errorId)}
      className={cx("vz-field-group", Boolean(error) && "vz-field-group--invalid", className)}
    >
      <legend>{legend}</legend>
      {description ? <p id={descriptionId} className="vz-field__description">{description}</p> : null}
      <div className="vz-field-group__content">{children}</div>
      {error ? <p id={errorId} className="vz-field__error" role="alert">{error}</p> : null}
    </fieldset>
  );
}

export interface ValidationIssue {
  readonly id: string;
  readonly fieldId?: string;
  readonly message: ReactNode;
}

export interface ValidationSummaryProps {
  readonly title?: string;
  readonly issues: readonly ValidationIssue[];
  readonly className?: string;
  readonly focusOnMount?: boolean;
}

export function ValidationSummary({
  title = "Check the highlighted fields",
  issues,
  className,
  focusOnMount = false,
}: ValidationSummaryProps) {
  const generatedId = useId().replaceAll(":", "");
  const titleId = `vz-validation-summary-${generatedId}`;
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusOnMount && issues.length > 0) summaryRef.current?.focus();
  }, [focusOnMount, issues.length]);

  if (issues.length === 0) return null;
  return (
    <section
      ref={summaryRef}
      className={cx("vz-validation-summary", className)}
      aria-labelledby={titleId}
      role="alert"
      tabIndex={focusOnMount ? -1 : undefined}
    >
      <h2 id={titleId}>{title}</h2>
      <ul>
        {issues.map((issue) => (
          <li key={issue.id}>
            {issue.fieldId ? <a href={`#${issue.fieldId}`}>{issue.message}</a> : issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("vz-input", className)} />;
}

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="search" className={cx("vz-input", "vz-input--search", className)} />;
}

export function Textarea({ className, rows = 4, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={rows} className={cx("vz-textarea", className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx("vz-select", className)}>{children}</select>;
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  readonly label: ReactNode;
  readonly description?: ReactNode;
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? `vz-check-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <label className={cx("vz-choice", className)} htmlFor={controlId}>
      <input {...props} id={controlId} type="checkbox" aria-describedby={descriptionId} />
      <span className="vz-choice__mark" aria-hidden="true" />
      <span className="vz-choice__copy">
        <strong>{label}</strong>
        {description ? <small id={descriptionId}>{description}</small> : null}
      </span>
    </label>
  );
}

export interface RadioOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

export interface RadioGroupProps {
  readonly name: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly options: readonly RadioOption[];
  readonly onChange?: (value: string) => void;
  readonly className?: string;
}

export function RadioGroup({
  name,
  value,
  defaultValue,
  options,
  onChange,
  className,
}: RadioGroupProps) {
  const id = useId().replaceAll(":", "");
  return (
    <div className={cx("vz-radio-group", className)}>
      {options.map((option, index) => {
        const controlId = `${id}-${index}`;
        const descriptionId = option.description ? `${controlId}-description` : undefined;
        return (
          <label className="vz-choice" htmlFor={controlId} key={option.value}>
            <input
              id={controlId}
              type="radio"
              name={name}
              value={option.value}
              disabled={option.disabled}
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={value === undefined ? defaultValue === option.value : undefined}
              aria-describedby={descriptionId}
              onChange={(event) => onChange?.(event.currentTarget.value)}
            />
            <span className="vz-choice__mark" aria-hidden="true" />
            <span className="vz-choice__copy">
              <strong>{option.label}</strong>
              {option.description ? <small id={descriptionId}>{option.description}</small> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  readonly label: ReactNode;
  readonly description?: ReactNode;
}

export function Switch({ label, description, className, id, ...props }: SwitchProps) {
  const generatedId = useId();
  const controlId = id ?? `vz-switch-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <label className={cx("vz-switch", className)} htmlFor={controlId}>
      <span className="vz-switch__copy">
        <strong>{label}</strong>
        {description ? <small id={descriptionId}>{description}</small> : null}
      </span>
      <input {...props} id={controlId} type="checkbox" role="switch" aria-describedby={descriptionId} />
      <span className="vz-switch__track" aria-hidden="true"><span /></span>
    </label>
  );
}

export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput {...props} type="date" />;
}

export function TimeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput {...props} type="time" />;
}

export interface DateTimeRangeProps {
  readonly legend: ReactNode;
  readonly startLabel?: string;
  readonly endLabel?: string;
  readonly startName: string;
  readonly endName: string;
  readonly startValue?: string;
  readonly endValue?: string;
  readonly error?: ReactNode;
  readonly onStartChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  readonly onEndChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
}

export function DateTimeRange({
  legend,
  startLabel = "Starts",
  endLabel = "Ends",
  startName,
  endName,
  startValue,
  endValue,
  error,
  onStartChange,
  onEndChange,
}: DateTimeRangeProps) {
  return (
    <FieldGroup legend={legend} error={error}>
      <div className="vz-date-time-range">
        <Field label={startLabel}>
          <TextInput name={startName} type="datetime-local" value={startValue} onChange={onStartChange} />
        </Field>
        <Field label={endLabel}>
          <TextInput name={endName} type="datetime-local" value={endValue} onChange={onEndChange} />
        </Field>
      </div>
    </FieldGroup>
  );
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cx("vz-field__label", className)} />;
}

export function FieldList({ children }: { readonly children: ReactNode }) {
  return <div className="vz-field-list">{Children.toArray(children)}</div>;
}
