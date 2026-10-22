import { DEPTS, deptColor, fieldLabel } from "@/lib/vic/analytics"
import { cn } from "@/lib/utils"
import type { Model } from "../model"
import { heat } from "./chart-style"
import { BarList, Figure, Key, Panel } from "./kit"

export function DemandCard({ m }: { m: Model }) {
  const items = [...m.demand].sort((a, b) => b.first - a.first).map((d) => ({ key: d.dept, label: d.dept, value: d.first, value2: d.second, color: deptColor(d.dept) }))
  const top = m.demand.reduce((b, d) => (d.first > b.first ? d : b), m.demand[0])
  return (
    <Panel
      title="Department demand"
      description={m.live.length && top.first ? `${top.dept} is the most asked first choice, by ${Math.round((top.first * 100) / m.live.length)}% of applicants.` : "1st and 2nd choices per department."}
      className="lg:col-span-2"
    >
      <div className="mb-5 flex flex-wrap gap-x-10 gap-y-3">
        <Figure value={m.sameChoice} label="chose the same department twice" />
        <Figure value={m.noSecond} label="gave no 2nd choice" />
      </div>
      <BarList items={items} />
      <div className="mt-4 flex gap-4">
        <Key color="var(--foreground)">1st choice</Key>
        <Key color="var(--foreground)" pale>2nd choice</Key>
      </div>
    </Panel>
  )
}

/** 1st → 2nd choice pairs: rows are the 1st choice, columns the 2nd; the diagonal is the same department twice. */
export function PairsCard({ m }: { m: Model }) {
  const max = Math.max(1, ...m.pairs.flat())
  return (
    <Panel title="1st → 2nd choice" description="Read across: of those who chose a department first, where they went second. The outlined diagonal is the same department twice.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] border-separate border-spacing-[3px] text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-16 text-left text-xs font-semibold text-muted-foreground">1st ↓ 2nd →</th>
              {DEPTS.map((d) => (
                <th key={d} scope="col" className="pb-1 text-center text-xs font-bold">
                  <DeptHead d={d} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEPTS.map((a, i) => (
              <tr key={a}>
                <th scope="row" className="pr-2 text-left text-xs font-bold">
                  <DeptHead d={a} />
                </th>
                {DEPTS.map((b, j) => (
                  <td
                    key={b}
                    className={cn("num h-11 rounded-[6px] text-center font-semibold", i === j && "outline outline-1 -outline-offset-1 outline-foreground/40", !m.pairs[i][j] && "bg-muted/60 text-muted-foreground")}
                    style={heat(m.pairs[i][j], max)}
                    title={`${a} first, ${b} second: ${m.pairs[i][j]}`}
                  >
                    {m.pairs[i][j] || "·"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function FieldDeptCard({ m }: { m: Model }) {
  const max = Math.max(1, ...m.fieldDept.flatMap((r) => r.cells))
  return (
    <Panel title="Field × department" description="Who applies where: each field's applicants by 1st choice. Darker is more." className="lg:col-span-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-separate border-spacing-[3px] text-sm">
          <thead>
            <tr>
              <th scope="col" className="text-left text-xs font-semibold text-muted-foreground">Field</th>
              {DEPTS.map((d) => (
                <th key={d} scope="col" className="w-[16%] pb-1 text-center text-xs font-bold">
                  <DeptHead d={d} />
                </th>
              ))}
              <th scope="col" className="w-14 text-right text-xs font-semibold text-muted-foreground">All</th>
            </tr>
          </thead>
          <tbody>
            {m.fieldDept.map((r) => (
              <tr key={r.field}>
                <th scope="row" className="max-w-[14rem] truncate pr-2 text-left font-medium" title={fieldLabel(r.field)}>
                  <span className="mr-2 text-xs font-bold text-muted-foreground">{r.field === "—" ? "" : r.field}</span>
                  {r.field === "—" ? "Not given" : fieldLabel(r.field)}
                </th>
                {r.cells.map((n, j) => (
                  <td key={j} className={cn("num h-9 rounded-[6px] text-center font-semibold", !n && "bg-muted/60 text-muted-foreground")} style={heat(n, max)} title={`${r.field}, ${DEPTS[j]} first: ${n}`}>
                    {n || "·"}
                  </td>
                ))}
                <td className="num text-right font-bold">{r.cells.reduce((t, n) => t + n, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function DeptHead({ d }: { d: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: deptColor(d) }} aria-hidden="true" />
      {d}
    </span>
  )
}
