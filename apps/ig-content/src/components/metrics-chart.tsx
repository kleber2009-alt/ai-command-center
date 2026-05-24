'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const AXIS = { stroke: '#71717a', fontSize: 12 }
const GRID = '#27272a'

export function ReachTimeline({
  data,
}: {
  data: { label: string; views: number; saves: number }[]
}) {
  if (data.length === 0) {
    return <Empty>Пока нет данных по охватам</Empty>
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="views" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS} tickLine={false} axisLine={false} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            background: '#141414',
            border: '1px solid #27272a',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area type="monotone" dataKey="views" stroke="#f59e0b" fill="url(#views)" name="Просмотры" />
        <Area type="monotone" dataKey="saves" stroke="#34d399" fill="transparent" name="Сохранения" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function ReachByType({ data }: { data: { name: string; reach: number }[] }) {
  if (data.every((d) => d.reach === 0)) {
    return <Empty>Пока нет охватов по форматам</Empty>
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="name" {...AXIS} tickLine={false} axisLine={false} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'rgba(245,158,11,0.08)' }}
          contentStyle={{
            background: '#141414',
            border: '1px solid #27272a',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="reach" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Охват" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
