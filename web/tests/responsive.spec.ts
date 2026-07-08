import { test, expect } from '@playwright/test'

test('KPI grid collapses to 2 columns below md breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  const grid = page.getByTestId('kpi-grid')

  // Real computed-style check, not a class-name substring: a class string can
  // be present on an element while a *descendant* still renders broken (e.g. a
  // wrapper div carrying grid-cols-2 around a single non-spanning child squishes
  // that child into one track). Assert the actual number of CSS grid tracks.
  const columns = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,
  )
  expect(columns).toBe(2)

  // Track count alone is not sufficient either: it stays "2" even when a
  // wrapper div squishes KpiCards' real grid into a single track (measured
  // empirically — gridTemplateColumns reports "165.5px 165.5px" in BOTH the
  // correct layout and the squished-wrapper regression). What actually differs
  // is the rendered width of a real card. Assert a real KPI card occupies a
  // substantial share of the viewport, not a fraction of a fraction.
  const cardBox = await page.getByTestId('kpi-active').boundingBox()
  const viewport = page.viewportSize()
  expect(cardBox).not.toBeNull()
  expect(cardBox!.width).toBeGreaterThan(viewport!.width * 0.3)
})

test('sidebar collapses behind hamburger below xl breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/')
  await expect(page.getByTestId('hamburger-toggle')).toBeVisible()
  await expect(page.getByTestId('sidebar')).not.toBeVisible()
})

test('sidebar is visible at xl breakpoint without hamburger', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByTestId('sidebar')).toBeVisible()
})
