/** Replaces `{name}` placeholders; unknown placeholders are left as they are. Safe to import in islands. */
export function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
