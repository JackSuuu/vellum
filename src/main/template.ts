import type { LocationInfo, NoteTemplate, TemplateContext } from '@shared/types'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (value: number): string => String(value).padStart(2, '0')

/** 2026/10/21 */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/** 10:36 */
export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** October 21, 2026 at 10:36 */
export function formatLongDateTime(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} at ${formatTime(date)}`
}

export function formatWeekday(date: Date): string {
  return WEEKDAYS[date.getDay()]
}

export function buildTemplateContext(
  template: NoteTemplate,
  location: LocationInfo | null,
  now: Date = new Date()
): TemplateContext {
  return {
    title: template.name,
    date: formatDate(now),
    time: formatTime(now),
    datetime: formatLongDateTime(now),
    weekday: formatWeekday(now),
    location: location ? [location.city, location.region, location.country].filter(Boolean).join(', ') : ''
  }
}

/**
 * Replace {{placeholder}} tokens. Unknown placeholders are removed so a typo
 * never leaks into the note.
 */
export function renderTemplate(template: NoteTemplate, context: TemplateContext): string {
  return template.content
    .replace(/\{\{\s*title\s*\}\}/gi, context.title)
    .replace(/\{\{\s*date\s*\}\}/gi, context.date)
    .replace(/\{\{\s*time\s*\}\}/gi, context.time)
    .replace(/\{\{\s*datetime\s*\}\}/gi, context.datetime)
    .replace(/\{\{\s*weekday\s*\}\}/gi, context.weekday)
    .replace(/\{\{\s*location\s*\}\}/gi, context.location)
    .replace(/\{\{[a-z_]+\}\}/gi, '')
}

/** First heading (or first non-empty line) of a markdown document. */
export function deriveTitle(markdown: string, fallback = 'Untitled'): string {
  const heading = markdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m)
  if (heading) return heading[1].trim().slice(0, 80)
  const line = markdown
    .split('\n')
    .map((l) => l.replace(/^[\s>#*-]+/, '').trim())
    .find((l) => l.length > 0)
  return line ? line.slice(0, 80) : fallback
}
