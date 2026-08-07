import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
} from "react";
import { Button, IconButton, Link } from "./primitives.js";
import { cx } from "./utilities.js";

export interface DataColumn<Row> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: "start" | "center" | "end";
  readonly width?: string;
  readonly headerDescription?: string;
  readonly sortable?: boolean;
  readonly sortDirection?: "ascending" | "descending" | "none";
  readonly onSort?: () => void;
}

export interface DataTableProps<Row> extends Omit<TableHTMLAttributes<HTMLTableElement>, "children"> {
  readonly caption: string;
  readonly rows: readonly Row[];
  readonly columns: readonly DataColumn<Row>[];
  readonly getRowId: (row: Row) => string;
  readonly selectedRowIds?: ReadonlySet<string>;
  readonly onSelectionChange?: (rowId: string, selected: boolean) => void;
  readonly onSelectAll?: (selected: boolean) => void;
  readonly rowActions?: (row: Row) => ReactNode;
  readonly empty?: ReactNode;
  readonly density?: "comfortable" | "compact";
  readonly stickyHeader?: boolean;
}

export function DataTable<Row>({
  caption,
  rows,
  columns,
  getRowId,
  selectedRowIds,
  onSelectionChange,
  onSelectAll,
  rowActions,
  empty,
  density = "comfortable",
  stickyHeader = false,
  className,
  ...props
}: DataTableProps<Row>) {
  const selectionEnabled = selectedRowIds !== undefined && onSelectionChange !== undefined;
  const allSelected = selectionEnabled && rows.length > 0 && rows.every((row) => selectedRowIds.has(getRowId(row)));
  const someSelected = selectionEnabled && rows.some((row) => selectedRowIds.has(getRowId(row))) && !allSelected;
  return (
    <div className={cx("vz-table-wrap", stickyHeader && "vz-table-wrap--sticky")}>
      <table {...props} className={cx("vz-table", `vz-table--${density}`, className)}>
        <caption className="vz-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {selectionEnabled ? (
              <th scope="col" className="vz-table__selection">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = someSelected;
                  }}
                  onChange={(event) => onSelectAll?.(event.currentTarget.checked)}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                data-align={column.align ?? "start"}
                aria-sort={column.sortable ? column.sortDirection ?? "none" : undefined}
                title={column.headerDescription}
              >
                {column.sortable ? (
                  <button type="button" className="vz-table__sort" onClick={column.onSort}>
                    <span>{column.header}</span>
                    <span aria-hidden="true">{column.sortDirection === "ascending" ? "↑" : column.sortDirection === "descending" ? "↓" : "↕"}</span>
                  </button>
                ) : column.header}
              </th>
            ))}
            {rowActions ? <th scope="col"><span className="vz-visually-hidden">Row actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowId = getRowId(row);
            const selected = selectedRowIds?.has(rowId) ?? false;
            return (
              <tr key={rowId} data-selected={selected || undefined}>
                {selectionEnabled ? (
                  <td className="vz-table__selection">
                    <input
                      type="checkbox"
                      aria-label={`Select row ${rowId}`}
                      checked={selected}
                      onChange={(event) => onSelectionChange(rowId, event.currentTarget.checked)}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td key={column.key} data-align={column.align ?? "start"}>{column.cell(row)}</td>
                ))}
                {rowActions ? <td className="vz-table__actions">{rowActions(row)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="vz-table__empty">{empty ?? "No records match this view."}</div> : null}
    </div>
  );
}

export interface PaginationProps extends HTMLAttributes<HTMLElement> {
  readonly currentPage: number;
  readonly totalPages?: number;
  readonly previousHref?: string;
  readonly nextHref?: string;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
  readonly itemLabel?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  previousHref,
  nextHref,
  onPrevious,
  onNext,
  itemLabel = "results",
  className,
  ...props
}: PaginationProps) {
  const summary = totalPages ? `Page ${currentPage} of ${totalPages}` : `Page ${currentPage}`;
  return (
    <nav {...props} className={cx("vz-pagination", className)} aria-label={`${itemLabel} pagination`}>
      <span aria-live="polite">{summary}</span>
      <div>
        {previousHref ? <Link href={previousHref} variant="standalone">Previous</Link> : (
          <Button variant="secondary" size="small" onClick={onPrevious} disabled={!onPrevious}>Previous</Button>
        )}
        {nextHref ? <Link href={nextHref} variant="standalone">Next</Link> : (
          <Button variant="secondary" size="small" onClick={onNext} disabled={!onNext}>Next</Button>
        )}
      </div>
    </nav>
  );
}

export interface FilterDefinition {
  readonly id: string;
  readonly label: string;
  readonly value?: string;
  readonly onRemove?: () => void;
}

export interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly activeFilters?: readonly FilterDefinition[];
  readonly onClearAll?: () => void;
  readonly resultsSummary?: ReactNode;
}

export function FilterBar({ children, activeFilters = [], onClearAll, resultsSummary, className, ...props }: FilterBarProps) {
  return (
    <section {...props} className={cx("vz-filter-bar", className)} aria-label="Filters">
      <div className="vz-filter-bar__controls">{children}</div>
      {activeFilters.length > 0 ? (
        <div className="vz-filter-bar__active" aria-label="Active filters">
          {activeFilters.map((filter) => (
            <span className="vz-filter-token" key={filter.id}>
              <span>{filter.label}{filter.value ? `: ${filter.value}` : ""}</span>
              {filter.onRemove ? <IconButton size="small" label={`Remove ${filter.label} filter`} icon={<span aria-hidden="true">×</span>} onClick={filter.onRemove} /> : null}
            </span>
          ))}
          {onClearAll ? <Button variant="quiet" size="small" onClick={onClearAll}>Clear all</Button> : null}
        </div>
      ) : null}
      {resultsSummary ? <div className="vz-filter-bar__summary" aria-live="polite">{resultsSummary}</div> : null}
    </section>
  );
}

export interface BulkActionBarProps extends HTMLAttributes<HTMLDivElement> {
  readonly selectedCount: number;
  readonly children: ReactNode;
  readonly onClear?: () => void;
}

export function BulkActionBar({ selectedCount, children, onClear, className, ...props }: BulkActionBarProps) {
  if (selectedCount <= 0) return null;
  return (
    <div {...props} className={cx("vz-bulk-actions", className)} role="region" aria-label="Bulk actions">
      <strong>{selectedCount} selected</strong>
      <div className="vz-bulk-actions__commands">{children}</div>
      {onClear ? <Button variant="quiet" size="small" onClick={onClear}>Clear selection</Button> : null}
    </div>
  );
}
