import { test, expect } from '@playwright/test'

// Runs against the real comet-panel binary (see Step 2 for how it's started),
// not the Vite dev server — this exercises the full embed + API + React chain.
test.use({ baseURL: 'http://localhost:8990' })

test('dashboard loads real changes from the configured workspace and renders KPI cards', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('kpi-grid')).toBeVisible()
  const activeCard = page.getByTestId('kpi-active')
  await expect(activeCard).toBeVisible()
  const text = await activeCard.textContent()
  expect(text).toMatch(/\d+/) // some active-change count rendered, not "NaN" or empty
})

test('selecting a change renders its PhaseStepper with a valid current step', async ({ page }) => {
  await page.goto('/')
  const firstChange = page.locator('[data-testid="sidebar"] >> text=/.+/').first()
  await firstChange.click()
  const steps = ['step-open', 'step-design', 'step-build', 'step-verify', 'step-archive']
  let currentCount = 0
  for (const id of steps) {
    const state = await page.getByTestId(id).getAttribute('data-state')
    if (state === 'current') currentCount++
  }
  expect(currentCount).toBe(1) // exactly one phase is "current"
})
