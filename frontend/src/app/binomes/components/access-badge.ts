export const NOW_TONE: Record<string, string> = {
  none: "bg-secondary text-muted-foreground",
  view: "bg-info-soft text-info",
  edit: "bg-success-soft text-success",
  owner: "bg-accent text-accent-foreground",
}

/** Short label for the level an admin opened a binome at (Binomes table). */
export const ACCESS_BADGE: Record<string, { label: string; tone: string } | undefined> = {
  view: { label: "Open · view", tone: NOW_TONE.view },
  edit: { label: "Open · edit", tone: NOW_TONE.edit },
}
