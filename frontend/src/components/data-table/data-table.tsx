"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTablePagination } from "./data-table-pagination"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** filters, search and view options above the table: gets the table instance */
  toolbar?: (table: TanTable<TData>) => React.ReactNode
  loading?: boolean
  /** shown when the filtered data is empty */
  empty?: React.ReactNode
  initialSorting?: SortingState
  initialFilters?: ColumnFiltersState
  initialVisibility?: VisibilityState
  pageSize?: number
  /** a stable id per row (default: index), so selection survives refreshes */
  getRowId?: (row: TData) => string
  /** a tap anywhere on a row (outside its buttons, links and inputs) */
  onRowClick?: (row: TData) => void
}

/** The template's data table (TanStack): sorting, faceted filters, column visibility, pagination. Generic over the row type. */
export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  loading,
  empty,
  initialSorting = [],
  initialFilters = [],
  initialVisibility = {},
  pageSize = 10,
  getRowId,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialVisibility)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(initialFilters)
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize })

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, columnVisibility, columnFilters, pagination },
    onPaginationChange: setPagination,
    autoResetPageIndex: false, // a live refresh must not send the reader back to page 1
    onSortingChange: setSorting,
    onColumnFiltersChange: (u) => {
      setColumnFilters(u)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  // the toolbar's search is a global filter (or a column one): either way a changed filter starts at page 1; a shrunk list clamps
  const pageCount = table.getPageCount()
  React.useEffect(() => {
    if (pagination.pageIndex > 0 && pagination.pageIndex >= pageCount) setPagination((p) => ({ ...p, pageIndex: Math.max(0, pageCount - 1) }))
  }, [pageCount, pagination.pageIndex])

  return (
    <div className="space-y-4">
      {toolbar?.(table)}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan} className="h-11 font-semibold text-foreground/80">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={
                    onRowClick &&
                    ((e) => {
                      // a control inside the row keeps its own action; a text selection is not a tap
                      if ((e.target as HTMLElement).closest("button, a, input, select, textarea, label, [role=checkbox], [role=menuitem]")) return
                      if (window.getSelection()?.toString()) return
                      onRowClick(row.original)
                    })
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-40 text-center">
                  {empty ?? <span className="text-muted-foreground">No results.</span>}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
