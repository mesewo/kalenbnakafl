"use client";

import { useMemo, useState, type ReactNode } from "react";

export type DataTableColumn<T> = {
  id: string;
  label: string;
  header: ReactNode;
  cell: (item: T) => ReactNode;
  searchText?: (item: T) => string;
  sortValue?: (item: T) => string | number;
};

export default function DataTable<T>({
  rows,
  rowKey,
  columns,
  loading,
  loadingLabel,
  error,
  emptyState,
  searchable = false,
  searchPlaceholder,
  className = "",
}: {
  rows: T[];
  rowKey: (item: T) => string | number;
  columns: DataTableColumn<T>[];
  loading?: boolean;
  loadingLabel: string;
  error?: ReactNode;
  emptyState: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ id: string; descending: boolean } | null>(null);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const filtered = term
      ? rows.filter((item) =>
          columns.some((column) => column.searchText?.(item).toLocaleLowerCase().includes(term)),
        )
      : rows;
    if (!sort) return filtered;
    const column = columns.find((candidate) => candidate.id === sort.id);
    if (!column?.sortValue) return filtered;
    return [...filtered].sort((a, b) => {
      const left = column.sortValue?.(a) ?? "";
      const right = column.sortValue?.(b) ?? "";
      const compared =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sort.descending ? -compared : compared;
    });
  }, [columns, rows, search, sort]);

  if (loading) {
    return (
      <div className={`table-wrap ${className}`.trim()} aria-label={loadingLabel} role="status">
        <table className="data-table">
          <tbody>
            {Array.from({ length: 5 }, (_, index) => (
              <tr className="skeleton-row" key={index}>
                <td aria-hidden="true" colSpan={columns.length} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (error)
    return (
      <div className="status status-error" role="alert">
        {error}
      </div>
    );
  if (rows.length === 0 || visibleRows.length === 0)
    return <div className="empty-state">{emptyState}</div>;

  return (
    <div className={`data-table-container ${className}`.trim()}>
      {searchable && (
        <label className="field data-table-search">
          <span>{searchPlaceholder}</span>
          <input
            type="search"
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.id} scope="col">
                  {column.sortValue ? (
                    <button
                      type="button"
                      className="data-table-sort"
                      aria-pressed={sort?.id === column.id}
                      onClick={() =>
                        setSort((current) =>
                          current?.id === column.id
                            ? { id: column.id, descending: !current.descending }
                            : { id: column.id, descending: false },
                        )
                      }
                    >
                      {column.header}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((item) => (
              <tr key={rowKey(item)}>
                {columns.map((column) => (
                  <td key={column.id} data-label={column.label}>
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
