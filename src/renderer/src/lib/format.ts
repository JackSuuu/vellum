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

export const pad2 = (value: number): string => String(value).padStart(2, '0')

/** 2026/10/21 */
export const formatDate = (date: Date): string =>
  `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`

/** 10:36 */
export const formatTime = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`

/** October 21, 2026 at 10:35 */
export const formatLongDateTime = (date: Date): string =>
  `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} at ${formatTime(date)}`

/** Tuesday */
export const formatWeekday = (date: Date): string => WEEKDAYS[date.getDay()]

export const formatRelative = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  const minute = 60_000
  if (diff < minute) return 'just now'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)}m ago`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))}h ago`
  if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))}d ago`
  return formatDate(new Date(timestamp))
}

export const formatLocationLabel = (location: {
  city: string
  region: string
  country: string
} | null): string => {
  if (!location) return ''
  return [location.city, location.region, location.country].filter(Boolean).join(', ')
}
