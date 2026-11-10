import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import { env } from './env'

const visible = (page: Page, sel: string, timeout = 15_000) =>
  page.locator(sel).first().waitFor({ state: 'visible', timeout }).then(() => true, () => false)

// buyer approves order in sandbox checkout → redirect to return_url
export async function approveOrder(orderId: string) {
  const browser = await chromium.launch({ headless: env.headless })
  const page = await browser.newPage()
  // stub return_url → no dashboard needed
  await page.route(/\/topup\/(return|cancel)/, (r) => r.fulfill({ body: 'ok' }))
  try {
    await page.goto(`https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`)

    await page.fill('#email', env.buyerEmail)
    // split login: email → next → password. single page: both visible
    if (await visible(page, '#btnNext', 5_000)) await page.click('#btnNext')
    await page.locator('#password').waitFor({ state: 'visible' })
    await page.fill('#password', env.buyerPass)
    await page.click('#btnLogin')

    // review page: agree/continue/pay button, label varies
    const submit = page
      .locator('[data-testid="submit-button-initial"], #payment-submit-btn, button:has-text("Agree"), button:has-text("Continue"), button:has-text("Pay")')
      .first()
    await submit.waitFor({ state: 'visible', timeout: 45_000 })
    await submit.click()

    await page.waitForURL(/\/topup\/return/, { timeout: 60_000 })
  } catch (e) {
    await mkdir('out', { recursive: true })
    await page.screenshot({ path: 'out/paypal-fail.png', fullPage: true })
    throw new Error(`paypal approval failed (see out/paypal-fail.png): ${(e as Error).message}`)
  } finally {
    await browser.close()
  }
}
