import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  BookOpen,
  Bookmark,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Grid2X2,
  GripVertical,
  Headphones,
  Home,
  ListFilter,
  MessageSquare,
  MoreHorizontal,
  PencilRuler,
  Play,
  Plus,
  Presentation,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  Video,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { cn } from "./utilities.js";

export type IconName =
  | "home"
  | "book"
  | "grid"
  | "check"
  | "calendar"
  | "chart"
  | "search"
  | "bell"
  | "arrow"
  | "arrow-up"
  | "arrow-down"
  | "play"
  | "people"
  | "studio"
  | "message"
  | "admin"
  | "help"
  | "classroom"
  | "evidence"
  | "support"
  | "share"
  | "clock"
  | "more"
  | "bookmark"
  | "download"
  | "upload"
  | "external-link"
  | "plus"
  | "close"
  | "delete"
  | "grip"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "chevron-down"
  | "check-circle"
  | "filter"
  | "sliders"
  | "file"
  | "video";

export type IconSize = "small" | "medium" | "large";

const iconMap = {
  home: Home,
  book: BookOpen,
  grid: Grid2X2,
  check: CalendarCheck,
  calendar: Calendar,
  chart: BarChart3,
  search: Search,
  bell: Bell,
  arrow: ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  play: Play,
  people: Users,
  studio: PencilRuler,
  message: MessageSquare,
  admin: ShieldCheck,
  help: CircleHelp,
  classroom: Presentation,
  evidence: FileCheck2,
  support: Headphones,
  share: Share2,
  clock: Clock3,
  more: MoreHorizontal,
  bookmark: Bookmark,
  download: Download,
  upload: Upload,
  "external-link": ExternalLink,
  plus: Plus,
  close: X,
  delete: Trash2,
  grip: GripVertical,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "chevron-down": ChevronDown,
  "check-circle": CheckCircle2,
  filter: ListFilter,
  sliders: SlidersHorizontal,
  file: FileText,
  video: Video,
} satisfies Record<IconName, LucideIcon>;

const sizeMap: Record<IconSize, number> = {
  small: 16,
  medium: 18,
  large: 24,
};

export interface IconProps extends Omit<LucideProps, "name" | "size" | "strokeWidth"> {
  readonly name: IconName;
  readonly size?: IconSize | number;
  readonly label?: string;
}

/**
 * Shared Veza product icon.
 *
 * Lucide provides geometry while Veza owns semantic names, optical sizes and
 * the Brand CI 2px stroke contract. Icons are decorative unless `label` is
 * supplied. Icon-only controls expose their accessible name on the control.
 */
export function Icon({
  name,
  size = "medium",
  label,
  className,
  ...props
}: IconProps) {
  const Component = iconMap[name];
  const pixels = typeof size === "number" ? size : sizeMap[size];

  return (
    <Component
      {...props}
      className={cn("vz-icon", className)}
      size={pixels}
      strokeWidth={2}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

export { Check as CheckIcon };
