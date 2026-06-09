/**
 * Path proof-chain — end-to-end walkthrough.
 *
 * Walks all 12 steps of the front-door Path instrument, screenshots each
 * stage, and verifies the navigator + step badge + slider interactions.
 *
 * Run with:
 *   pnpm exec playwright test
 *
 * Requires the dev server to be running on :5173 (`pnpm dev`).
 */

import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SCREENSHOT_DIR = 'tests/e2e/screenshots'

const STEP_TITLES: readonly string[] = [
  'Coulomb',
  'Classical collapse',
  'Stationary states',
  'No radiation yet',
  'Superposition',
  'Radiation',
  'Selection rules',
  'Decay',
  'Lineshape',
  'Pole',
  'Fields move poles',
  'The frontier',
]

test.beforeAll(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
})

test.describe('Path proof-chain', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        // eslint-disable-next-line no-console
        console.log(`[browser ${msg.type()}] ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.log(`[pageerror] ${err.message}`)
    })
  })

  test('renders the path navigator with 12 step pills', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#path-mount')).toBeVisible()
    const pills = page.locator('#path-mount button[data-step-id]')
    await expect(pills).toHaveCount(12)
  })

  test('initial step is 0 (Coulomb)', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#path-mount')).toContainText('Step 00')
    await expect(page.locator('#path-mount')).toContainText('Coulomb')
  })

  test('Next ▶ advances to step 1', async ({ page }) => {
    await page.goto('/')
    await page.locator('#path-mount [data-role="next"]').click()
    await expect(page.locator('#path-mount')).toContainText('Step 01')
    await expect(page.locator('#path-mount')).toContainText('Classical collapse')
  })

  test('◀ Prev returns to step 0', async ({ page }) => {
    await page.goto('/')
    await page.locator('#path-mount [data-role="next"]').click()
    await page.locator('#path-mount [data-role="prev"]').click()
    await expect(page.locator('#path-mount')).toContainText('Step 00')
  })

  test('slider on step 0 updates the read-out', async ({ page }) => {
    await page.goto('/')
    const slider = page.locator('#path-mount input[type="range"]').first()
    await expect(slider).toBeVisible()
    await slider.fill('5')
    await expect(page.locator('#path-mount')).toContainText('5.00 a₀')
  })

  test('lab-bench section is collapsed by default', async ({ page }) => {
    await page.goto('/')
    const details = page.locator('details:has(summary:has-text("Lab bench"))').first()
    await expect(details).toBeVisible()
    // The collapsible legacy instruments live inside; their inner content
    // shouldn't be visible until the user expands.
    await expect(details).not.toHaveAttribute('open', /.*/)
  })

  /**
   * Walk all 12 steps, screenshotting each. Records a small JSON report.
   */
  test('walks every step and screenshots each', async ({ page }) => {
    test.setTimeout(120_000)

    const report: Array<{
      idx: number
      title: string
      badge: string
      captionSnippet: string
      hasSlider: boolean
      sliderReadout?: string
      screenshot: string
    }> = []

    await page.goto('/')

    for (let i = 0; i < STEP_TITLES.length; i++) {
      const pill = page.locator(`#path-mount button[data-step-id="${i}"]`)
      await pill.click()

      // Wait for the badge to reflect this step.
      await expect(page.locator('#path-mount')).toContainText(
        `Step ${i.toString().padStart(2, '0')}`,
      )
      await expect(page.locator('#path-mount')).toContainText(STEP_TITLES[i])

      // Capture badge + caption + slider state.
      const badge =
        (await page
          .locator('#path-mount')
          .locator('text=Step ' + i.toString().padStart(2, '0'))
          .first()
          .textContent()) ?? ''

      const caption =
        (await page.locator('#path-mount [data-role="claim-body"]').textContent()) ?? ''
      const sliderEl = page.locator('#path-mount input[type="range"]').first()
      const hasSlider = await sliderEl.isVisible()
      let sliderReadout: string | undefined
      if (hasSlider) {
        // Slider read-out: the last span inside the same row as the slider.
        const readout = sliderEl.locator('xpath=following-sibling::*').last()
        sliderReadout = (await readout.textContent()) ?? undefined
      }

      // Hide the sticky cockpit + the page's own header for the duration of
      // the per-step screenshot — they otherwise bleed onto the path-mount
      // bounding box and obscure the 3D viewport in the captured pixels.
      await page.addStyleTag({
        content: `
          header[style*="sticky"] { display: none !important; }
          main > header { display: none !important; }
        `,
      })
      await page.locator('#path-mount').scrollIntoViewIfNeeded()
      // Allow a few rAF frames for the Three.js scene to render the new step.
      await page.waitForTimeout(350)
      const path = join(SCREENSHOT_DIR, `step-${i.toString().padStart(2, '0')}.png`)
      await page.locator('#path-mount').screenshot({ path })

      report.push({
        idx: i,
        title: STEP_TITLES[i],
        badge: badge.trim(),
        captionSnippet: (caption ?? '').slice(0, 120),
        hasSlider,
        sliderReadout,
        screenshot: path,
      })
    }

    // Full-page screenshot at the end for context.
    await page.locator('#path-mount button[data-step-id="0"]').click()
    await page.screenshot({
      path: join(SCREENSHOT_DIR, 'overview.png'),
      fullPage: true,
    })

    await writeFile(
      join(SCREENSHOT_DIR, 'walkthrough-report.json'),
      JSON.stringify(report, null, 2),
    )

    // Sanity: every step yielded a screenshot and a non-empty caption.
    expect(report).toHaveLength(12)
    for (const r of report) {
      expect(r.captionSnippet.length).toBeGreaterThan(0)
    }
  })
})
