"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "./utilities.js";

export interface TabDefinition {
  readonly id: string;
  readonly label: ReactNode;
  readonly content: ReactNode;
  readonly disabled?: boolean;
  readonly badge?: ReactNode;
}

export interface TabsProps {
  readonly tabs: readonly TabDefinition[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: "horizontal" | "vertical";
  readonly className?: string;
  readonly label: string;
}

/**
 * Accessible Veza tabs backed by Radix roving focus and keyboard behavior.
 * Veza retains the underline visual language and public data-driven API.
 */
export function Tabs({
  tabs,
  value,
  defaultValue,
  onValueChange,
  orientation = "horizontal",
  className,
  label,
}: TabsProps) {
  const firstEnabled = tabs.find((tab) => !tab.disabled)?.id ?? "";
  const requestedDefault = tabs.some((tab) => tab.id === defaultValue && !tab.disabled)
    ? defaultValue
    : firstEnabled;
  const controlledValue = value === undefined
    ? undefined
    : tabs.some((tab) => tab.id === value && !tab.disabled)
      ? value
      : firstEnabled;

  if (tabs.length === 0 || !firstEnabled) return null;

  return (
    <TabsPrimitive.Root
      value={controlledValue}
      defaultValue={requestedDefault}
      onValueChange={onValueChange}
      orientation={orientation}
      activationMode="automatic"
      className={cn("vz-tabs", `vz-tabs--${orientation}`, className)}
      data-slot="tabs"
    >
      <TabsPrimitive.List aria-label={label} className="vz-tabs__list" data-slot="tabs-list">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled}
            className="vz-tabs__trigger"
            data-slot="tabs-trigger"
          >
            <span className="vz-tabs__label">{tab.label}</span>
            {tab.badge ? <span className="vz-tabs__badge">{tab.badge}</span> : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content
          key={tab.id}
          value={tab.id}
          className="vz-tabs__panel"
          data-slot="tabs-panel"
        >
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

/**
 * Compatibility helper for feature modules that already own their tab list.
 */
export interface TabPanelsProps {
  readonly children: ReactNode;
  readonly activeId: string;
}

export function TabPanels({ children, activeId }: TabPanelsProps) {
  return <>{Children.map(children, (child) => {
    if (!isValidElement<{ id: string }>(child)) return null;
    return cloneElement(child as ReactElement<{ id: string; hidden?: boolean }>, { hidden: child.props.id !== activeId });
  })}</>;
}
