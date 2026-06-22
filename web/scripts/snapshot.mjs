import { chromium } from 'playwright'

const url = 'http://localhost:3000/engine'
const outPath = '/tmp/engine-snapshot.png'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
// Wait for WebGL canvas to render a few frames
await page.waitForTimeout(3000)
// Screenshot just the canvas if possible, otherwise full page
const canvas = await page.$('canvas')
if (canvas) {
  await canvas.screenshot({ path: outPath })
  console.log('Captured canvas to ' + outPath)
} else {
  await page.screenshot({ path: outPath, fullPage: false })
  console.log('Captured full page to ' + outPath)
}
await browser.close()
