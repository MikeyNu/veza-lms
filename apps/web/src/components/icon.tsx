import { Icon as VezaIcon, type IconName as VezaIconName, type IconProps as VezaIconProps } from "@veza/ui";

export type IconName = VezaIconName;
export type IconProps = VezaIconProps;

/**
 * Compatibility adapter for existing web feature imports.
 *
 * The icon implementation now lives in `@veza/ui`, which guarantees the
 * approved Veza 24px source grid, 2px stroke and shared optical sizing.
 */
export function Icon(props: IconProps) {
  return <VezaIcon {...props} />;
}
