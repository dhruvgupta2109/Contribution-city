export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function button(label: string, text = label, className = ''): HTMLButtonElement {
  const node = element('button', text, className);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  return node;
}

export const number = (value: number) => new Intl.NumberFormat('en').format(value);
export const longDate = (date: string) => new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T00:00:00Z`));
export const shortDate = (date: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T00:00:00Z`));
