/** Tooltip rows of a 2026-vs-2025 share chart ("2026  41% · 62"): keys maps each bar's dataKey to its year and count key. */
export function vsTip(keys: Record<string, [string, string]>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (value: number | string, name: string | number, _item: unknown, _i: number, p: Record<string, any>) => {
    const [year, countKey] = keys[String(name)] || [String(name), ""]
    return (
      <span className="flex w-full items-center justify-between gap-4">
        <span className="text-muted-foreground">{year}</span>
        <span className="num font-semibold text-foreground">
          {value}% <span className="font-normal text-muted-foreground">· {p[countKey]}</span>
        </span>
      </span>
    )
  }
}
