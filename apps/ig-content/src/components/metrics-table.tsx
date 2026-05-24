'use client'

import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'

export interface MetricTableRow {
  topic: string
  type: string
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  follows: number
  leads: number
}

const numCol = (key: keyof MetricTableRow, header: string): ColumnDef<MetricTableRow> => ({
  accessorKey: key,
  header: ({ column }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {header}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  ),
  cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span>,
})

const columns: ColumnDef<MetricTableRow>[] = [
  { accessorKey: 'topic', header: 'Тема', cell: ({ getValue }) => <span className="block max-w-[260px] truncate">{getValue<string>()}</span> },
  { accessorKey: 'type', header: 'Формат', cell: ({ getValue }) => <span className="capitalize">{getValue<string>()}</span> },
  numCol('views', 'Просм.'),
  numCol('likes', 'Лайки'),
  numCol('comments', 'Комм.'),
  numCol('saves', 'Сохр.'),
  numCol('shares', 'Репост'),
  numCol('follows', 'Подп.'),
  numCol('leads', 'Лиды'),
]

export function MetricsTable({ rows }: { rows: MetricTableRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'views', desc: true }])
  const data = useMemo(() => rows, [rows])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Пока нет метрик. Добавьте показатели на странице дня после публикации.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border text-left text-muted-foreground">
              {hg.headers.map((h) => (
                <th key={h.id} className="whitespace-nowrap p-3 font-medium">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-accent/40">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="whitespace-nowrap p-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
