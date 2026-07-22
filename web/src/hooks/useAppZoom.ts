import { useState, useEffect, useCallback } from 'react'

const ZOOM_KEY = 'comet-panel-zoom'
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.0
const DEFAULT_ZOOM = 1.0
const STEP = 0.1

function persistZoom(value: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(value))
  } catch {
    // ignore storage failures
  }
}

function loadZoom(): number {
  try {
    const v = localStorage.getItem(ZOOM_KEY)
    if (v) {
      const n = parseFloat(v)
      if (n >= MIN_ZOOM && n <= MAX_ZOOM) return n
    }
  } catch {
    // ignore
  }
  return DEFAULT_ZOOM
}

export interface UseAppZoomReturn {
  zoom: number
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  zoomPercent: string
}

export function useAppZoom(): UseAppZoomReturn {
  const [zoom, setZoom] = useState<number>(() => loadZoom())

  useEffect(() => {
    persistZoom(zoom)
  }, [zoom])

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, +(prev + STEP).toFixed(1)))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, +(prev - STEP).toFixed(1)))
  }, [])

  const zoomReset = useCallback(() => {
    setZoom(DEFAULT_ZOOM)
  }, [])

  const zoomPercent = `${Math.round(zoom * 100)}%`

  return { zoom, zoomIn, zoomOut, zoomReset, zoomPercent }
}
