import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { LocationInfo } from '@shared/types'

const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours
const REQUEST_TIMEOUT = 4000

interface Provider {
  name: string
  url: string
  parse: (raw: any) => LocationInfo | null
}

const PROVIDERS: Provider[] = [
  {
    // HTTPS, no API key, generous free tier.
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    parse: (raw) => {
      if (!raw || raw.error) return null
      return {
        city: raw.city ?? '',
        region: raw.region ?? '',
        country: raw.country_name ?? raw.country ?? '',
        timezone: raw.timezone ?? '',
        ip: raw.ip ?? '',
        source: 'ipapi.co',
        updatedAt: Date.now()
      }
    }
  },
  {
    // HTTP fallback (the free tier does not serve TLS).
    name: 'ip-api.com',
    url: 'http://ip-api.com/json/?fields=status,country,regionName,city,timezone,query',
    parse: (raw) => {
      if (!raw || raw.status !== 'success') return null
      return {
        city: raw.city ?? '',
        region: raw.regionName ?? '',
        country: raw.country ?? '',
        timezone: raw.timezone ?? '',
        ip: raw.query ?? '',
        source: 'ip-api.com',
        updatedAt: Date.now()
      }
    }
  },
  {
    // HTTPS fallback, no key required.
    name: 'ipwho.is',
    url: 'https://ipwho.is/',
    parse: (raw) => {
      if (!raw || raw.success === false) return null
      return {
        city: raw.city ?? '',
        region: raw.region ?? '',
        country: raw.country ?? '',
        timezone: raw.timezone?.id ?? '',
        ip: raw.ip ?? '',
        source: 'ipwho.is',
        updatedAt: Date.now()
      }
    }
  }
]

let cacheFile: string | null = null
let inflight: Promise<LocationInfo | null> | null = null

function cachePath(): string {
  if (!cacheFile) cacheFile = join(app.getPath('userData'), 'location-cache.json')
  return cacheFile
}

function readCache(): LocationInfo | null {
  try {
    const file = cachePath()
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as LocationInfo
    if (!parsed || typeof parsed.updatedAt !== 'number') return null
    if (Date.now() - parsed.updatedAt > CACHE_TTL) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(info: LocationInfo): void {
  try {
    const file = cachePath()
    if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(info), 'utf-8')
  } catch (error) {
    console.warn('[location] could not write cache:', error)
  }
}

async function fetchWithTimeout(url: string): Promise<any | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Vellum/0.1 (quick note)' }
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve the user's approximate location from their public IP address.
 * Runs in the main process so it works identically on every platform and
 * never triggers a browser geolocation permission prompt.
 */
export async function resolveLocation(force = false): Promise<LocationInfo | null> {
  if (!force) {
    const cached = readCache()
    if (cached) return cached
    if (inflight) return inflight
  }

  inflight = (async () => {
    for (const provider of PROVIDERS) {
      try {
        const raw = await fetchWithTimeout(provider.url)
        const info = provider.parse(raw)
        if (info && (info.city || info.region || info.country)) {
          writeCache(info)
          return info
        }
      } catch (error) {
        console.warn(`[location] provider ${provider.name} failed:`, error)
      }
    }
    return null
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function formatLocation(info: LocationInfo | null): string {
  if (!info) return ''
  return [info.city, info.region, info.country].filter(Boolean).join(', ')
}

/**
 * Wait for the location to become available (bounded).
 *
 * The lookup is kicked off when the app starts, so by the time a note is
 * created the answer is usually already cached in memory or on disk.
 */
export async function waitForLocation(timeoutMs = 3500): Promise<LocationInfo | null> {
  const cached = readCache()
  if (cached) return cached
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs).unref?.()
  })
  return Promise.race([resolveLocation(), timeout])
}
