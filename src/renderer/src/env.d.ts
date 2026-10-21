/// <reference types="vite/client" />

import type { VellumApi } from '@shared/api'

declare global {
  interface Window {
    vellum: VellumApi
  }
}

export {}
