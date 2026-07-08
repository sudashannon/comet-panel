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

// Regression test for the Task 12 finding: a change with no .comet.yaml at all
// (lz100-mllm-kai-benchmark, real data — 25/25 tasks complete but no lifecycle
// metadata) must render PhaseStepper's distinct "unknown" state, not silently
// fall back to "all pending" (which looks indistinguishable from "just
// started" despite the change being far along). Targets the change by its
// visible name text rather than .first(), so this doesn't depend on
// alphabetical ordering the way the test above incidentally does.
test('a change with no .comet.yaml renders PhaseStepper as unknown, not pending', async ({ page }) => {
  await page.goto('/')
  const target = page.locator('[data-testid="sidebar"] >> text=lz100-mllm-kai-benchmark').first()
  await expect(target).toBeVisible()
  await target.click()
  const steps = ['step-open', 'step-design', 'step-build', 'step-verify', 'step-archive']
  for (const id of steps) {
    const state = await page.getByTestId(id).getAttribute('data-state')
    expect(state).toBe('unknown')
  }
  await expect(page.getByTestId('phase-unknown-notice')).toBeVisible()
})
