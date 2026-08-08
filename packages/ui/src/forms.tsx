"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import {
  Children,
  cloneElement,
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithoutRef,
  type FieldsetHTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { CheckIcon, Icon } from "./icons.js";
import { cn, joinIds } from "./utilities.js";

interface DescribedControlProps {
  readonly id?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  readonly "aria-errormessage"?: string;
}

export interface FieldProps {
  readonly label: ReactNode;
  readonly labelAccessory?: ReactNode;
  readonly children: ReactElement<DescribedControlProps>;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly className?: string;
  readonly labelClassName?: string;
}

export function Field({
  label,
  labelAccessory,
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
    <div className={cn("vz-field", Boolean(error) && "vz-field--invalid", className)} data-slot="field">
      <label className={cn("vz-field__label", labelClassName)} htmlFor={controlId}>
        <span className="vz-field__label-copy">{label}</span>
        {labelAccessory ? <span className="vz-field__label-accessory">{labelAccessory}</span> : null}
      </label>
      {control}
      {description ? <p id={descriptionId} className="vz-field__description">{description}</p> : null}
      {error ? <p id={errorId} className="vz-field__error" role="alert">{error}</p> : null}
    </div>
  );
}

export interface OptionalFieldProps extends Omit<FieldProps, "labelAccessory"> {
  readonly optionalText?: string;
}

export function OptionalField({ optionalText = "Optional", ...props }: OptionalFieldProps) {
  return <Field {...props} labelAccessory={<span className="vz-field__optional">{optionalText}</span>} />;
}

export interface FieldGroupProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  readonly legend: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
}

export const FieldGroup = forwardRef<HTMLFieldSetElement, FieldGroupProps>(function FieldGroup(
  { legend, description, error, className, children, ...props },
  ref,
) {
  const id = useId().replaceAll(":", "");
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      {...props}
      ref={ref}
      aria-describedby={joinIds(props["aria-describedby"], descriptionId, errorId)}
      className={cn("vz-field-group", Boolean(error) && "vz-field-group--invalid", className)}
      data-slot="field-group"
    >
      <legend>{legend}</legend>
      {description ? <p id={descriptionId} className="vz-field__description">{description}</p> : null}
      <div className="vz-field-group__content">{children}</div>
      {error ? <p id={errorId} className="vz-field__error" role="alert">{error}</p> : null}
    </fieldset>
  );
});

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
      className={cn("vz-validation-summary", className)}
      role="alert"
      aria-labelledby={titleId}
      tabIndex={focusOnMount ? -1 : undefined}
      data-slot="validation-summary"
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

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...props },
  ref,
) {
  return <input {...props} ref={ref} className={cn("vz-input", className)} data-slot="input" />;
});

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function SearchInput(
  { className, ...props },
  ref,
) {
  return <input {...props} ref={ref} type="search" className={cn("vz-input", "vz-input--search", className)} data-slot="search-input" />;
});

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { className, ...props },
  ref,
) {
  return <input {...props} ref={ref} type="date" className={cn("vz-input", "vz-input--date", className)} data-slot="date-input" />;
});

export interface TimeInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { className, ...props },
  ref,
) {
  return <input {...props} ref={ref} type="time" className={cn("vz-input", "vz-input--time", className)} data-slot="time-input" />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return <textarea {...props} ref={ref} rows={rows} className={cn("vz-textarea", className)} data-slot="textarea" />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, disabled, ...props },
  ref,
) {
  return (
    <span className={cn("vz-select-wrap", disabled && "is-disabled")} data-slot="native-select-wrap">
      <select
        {...props}
        ref={ref}
        disabled={disabled}
        className={cn("vz-select", className)}
        data-slot="native-select"
      >
        {children}
      </select>
      <span className="vz-select__indicator" aria-hidden="true">
        <Icon name="chevron-down" size="small" />
      </span>
    </span>
  );
});

export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "onCheckedChange"> {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
  label,
  description,
  className,
  id,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? `vz-check-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${controlId}-description` : undefined;

  return (
    <div className={cn("vz-choice", className)} data-slot="checkbox-field">
      <CheckboxPrimitive.Root
        {...props}
        id={controlId}
        aria-describedby={joinIds(props["aria-describedby"], descriptionId)}
        className="vz-choice__mark"
        onCheckedChange={(checked) => onCheckedChange?.(checked === true)}
        data-slot="checkbox"
      >
        <CheckboxPrimitive.Indicator className="vz-choice__indicator">
          <CheckIcon size={14} strokeWidth={2} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label className="vz-choice__copy" htmlFor={controlId}>
        <strong>{label}</strong>
        {description ? <small id={descriptionId}>{description}</small> : null}
      </label>
    </div>
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
  readonly options: readonly RadioOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly disabled?: boolean;
  readonly orientation?: "vertical" | "horizontal";
  readonly className?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly "aria-describedby"?: string;
}

export function RadioGroup({
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  orientation = "vertical",
  className,
  ...ariaProps
}: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      {...ariaProps}
      name={name}
      {...(value !== undefined ? { value } : {})}
      {...(defaultValue !== undefined ? { defaultValue } : {})}
      {...(disabled !== undefined ? { disabled } : {})}
      orientation={orientation}
      {...(onValueChange !== undefined ? { onValueChange } : {})}
      className={cn("vz-radio-group", orientation === "horizontal" && "vz-radio-group--horizontal", className)}
      data-slot="radio-group"
    >
      {options.map((option) => {
        const optionId = `${name}-${option.value}`.replace(/[^A-Za-z0-9_-]/g, "-");
        return (
          <div className="vz-choice" key={option.value} data-slot="radio-field">
            <RadioGroupPrimitive.Item
              id={optionId}
              value={option.value}
              disabled={option.disabled}
              className="vz-choice__mark vz-choice__mark--radio"
              data-slot="radio"
            >
              <RadioGroupPrimitive.Indicator className="vz-choice__indicator">
                <span className="vz-choice__radio-dot" />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
            <label className="vz-choice__copy" htmlFor={optionId}>
              <strong>{option.label}</strong>
              {option.description ? <small>{option.description}</small> : null}
            </label>
          </div>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}

export interface SwitchProps extends Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, "onCheckedChange"> {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly onCheckedChange?: (checked: boolean) => void;
}

export function Switch({ label, description, className, id, onCheckedChange, ...props }: SwitchProps) {
  const generatedId = useId();
  const controlId = id ?? `vz-switch-${generatedId.replaceAll(":", "")}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return (
    <div className={cn("vz-switch", className)} data-slot="switch-field">
      <label className="vz-switch__copy" htmlFor={controlId}>
        <strong>{label}</strong>
        {description ? <small id={descriptionId}>{description}</small> : null}
      </label>
      <SwitchPrimitive.Root
        {...props}
        id={controlId}
        {...(joinIds(props["aria-describedby"], descriptionId) !== undefined
          ? { "aria-describedby": joinIds(props["aria-describedby"], descriptionId) }
          : {})}
        className="vz-switch__track"
        {...(onCheckedChange !== undefined ? { onCheckedChange } : {})}
        data-slot="switch"
      >
        <SwitchPrimitive.Thumb className="vz-switch__thumb" />
      </SwitchPrimitive.Root>
    </div>
  );
}

export interface DateTimeRangeProps {
  readonly legend: ReactNode;
  readonly startName: string;
  readonly endName: string;
  readonly startLabel?: string;
  readonly endLabel?: string;
  readonly defaultStart?: string;
  readonly defaultEnd?: string;
  readonly minimum?: string;
  readonly maximum?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly className?: string;
}

export function DateTimeRange({
  legend,
  startName,
  endName,
  startLabel = "Starts",
  endLabel = "Ends",
  defaultStart,
  defaultEnd,
  minimum,
  maximum,
  required,
  disabled,
  description,
  error,
  className,
}: DateTimeRangeProps) {
  return (
    <FieldGroup legend={legend} description={description} error={error} className={className}>
      <div className="vz-date-time-range">
        <Field label={startLabel}>
          <TextInput
            type="datetime-local"
            name={startName}
            defaultValue={defaultStart}
            min={minimum}
            max={maximum}
            required={required}
            disabled={disabled}
          />
        </Field>
        <Field label={endLabel}>
          <TextInput
            type="datetime-local"
            name={endName}
            defaultValue={defaultEnd}
            min={minimum}
            max={maximum}
            required={required}
            disabled={disabled}
          />
        </Field>
      </div>
    </FieldGroup>
  );
}

export interface LabeledControlProps {
  readonly label: ReactNode;
  readonly htmlFor: string;
  readonly description?: ReactNode;
  readonly className?: string;
}

export function LabeledControl({ label, htmlFor, description, className }: LabeledControlProps) {
  return (
    <label className={cn("vz-field__label", className)} htmlFor={htmlFor}>
      <span className="vz-field__label-copy">{label}</span>
      {description ? <span className="vz-field__label-accessory">{description}</span> : null}
    </label>
  );
}

export function FormControlGroup({ children }: { readonly children: ReactNode }) {
  return <div className="vz-field-list">{Children.toArray(children)}</div>;
}
