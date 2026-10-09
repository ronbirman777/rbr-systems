/** Replaces {name} placeholders; an unknown placeholder is left visible rather than dropped. Shared by the server translator and the client Admin provider. */
export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in values ? String(values[name]) : m));
}
