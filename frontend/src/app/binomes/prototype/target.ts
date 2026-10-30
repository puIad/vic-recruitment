// PROTOTYPE (#171): while the binome page is open, the details' Save writes to that binome instead of the admin's own.
export const protoTarget: { binome: string; patch: ((code: string, field: string, value: string | number | boolean) => void) | null } = { binome: "", patch: null }
