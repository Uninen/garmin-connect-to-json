import { chromium } from 'playwright-chromium'
import { fetchDataConfig, GarminDataItem } from './types'

import { readFile, writeFile } from 'fs/promises'
import { GARMIN_APP_VERSION, LOGIN_DELAY } from './config'

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function fetchData(year: string, month: string, config: fetchDataConfig) {
  return new Promise<GarminDataItem[]>(async (resolve, reject) => {
    month = `${parseInt(month) - 1}`
    let context = null

    const browser = await chromium.launch({
      args: ['--disable-dev-shm-usage'],
      headless: true,
    })

    if (!config.forceAuth) {
      try {
        const storageData = await readFile(config.browserStoragePath, {
          encoding: 'utf8',
        })
        const storageState = JSON.parse(storageData)
        if (config.debug) {
          console.log('session storage found: ', storageState)
        }
        context = await browser.newContext({
          storageState,
        })
        console.log(`✓ Using existing browser session.`)
      } catch (err) {
        console.log(`✓ Existing browser session not found.`)
        config.forceAuth = true
      }
    }

    if (config.forceAuth || !context) {
      context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 1024 },
      })
    }

    const page = await context.newPage()
    page.setExtraHTTPHeaders({
      'X-app-ver': GARMIN_APP_VERSION,
      'NK': 'NT',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    })

    const url = `https://connect.garmin.com/modern/proxy/calendar-service/year/${year}/month/${month}`
    if (config.debug) {
      console.log('fetchData URL: ', url)
    }

    if (config.forceAuth) {
      try {
        await page.goto('https://connect.garmin.com/signin')
        await page.waitForSelector('iframe')
        await sleep(LOGIN_DELAY)

        try {
          await page.waitForSelector('#truste-consent-button')
          await page.click('#truste-consent-button')
          console.log('#truste-consent-button clicked')
        } catch {
          console.log('#truste-consent-button never came')
        }

        if (config.debug) {
          await sleep(LOGIN_DELAY)
          await page.screenshot({
            path: `debug-00-unfilled-login.png`,
            fullPage: true,
          })
        }

        await page.frames()[1].check('#login-remember-checkbox')
        await page.frames()[1].fill('input[name="username"]', process.env.GARMIN_CONNECT_USERNAME!)
        await page.frames()[1].fill('input[name="password"]', process.env.GARMIN_CONNECT_PASSWORD!)

        if (config.debug) {
          await sleep(LOGIN_DELAY)
          await page.screenshot({
            path: `debug-01-filled-login.png`,
            fullPage: true,
          })
        }

        await page.frames()[1].click('#login-btn-signin')
        await page.waitForSelector('.user-profile')
        await sleep(LOGIN_DELAY * 2)
        if (config.debug) {
          await page.screenshot({
            path: `debug-02-after-login.png`,
            fullPage: true,
          })
        }

        await page.goto('https://connect.garmin.com/modern/calendar')

        const storage = await context.storageState()
        const storageJson = JSON.stringify(storage, null, 2)
        if (config.debug) {
          console.log('session storage: ', storageJson)
        }
        await writeFile(config.browserStoragePath, storageJson)
        console.log(`✓ Browser session created and saved to ${config.browserStoragePath}`)
      } catch (err) {
        if (config.debug) {
          console.log(err)
        }
        return reject(err)
      }
    }

    await page.goto('https://connect.garmin.com/modern/calendar')
    await sleep(LOGIN_DELAY * 2)
    if (config.debug) {
      await page.screenshot({
        path: `debug-03-calendar-home.png`,
        fullPage: true,
      })
    }

    page
      .goto(url)
      .then(async (response) => {
        if (!response) {
          return reject(new Error('Error: no response from Garmin Connect'))
        }
        const body = await response.body()
        const bodyString = body.toString()
        if (config.debug) {
          console.log('Raw data: ', bodyString)
        }

        const content = await JSON.parse(bodyString)
        await browser.close()
        process.stdout.write(` Done.\n`)
        return resolve(content.calendarItems)
      })
      .catch((error) => {
        console.log('Error fetching data: ', error)
        return reject(error)
      })
  })
}
