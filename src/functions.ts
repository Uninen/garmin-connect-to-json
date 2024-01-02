import dayjs from 'dayjs'
import { readFile, writeFile } from 'fs/promises'
import type { BrowserContext } from 'playwright-chromium'
import { chromium } from 'playwright-extra'
import { reverse, sortBy, uniqWith } from 'rambda'
import {
  DEBUG,
  LOGIN_DELAY_MS,
  SESSION_STORAGE_PATH,
  USER_AGENT,
  GARMIN_APP_VERSION,
} from './config'
import { EnrichedGarminDataItem, fetchDataConfig, GarminDataItem } from './types'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

chromium.use(StealthPlugin())

import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function getBrowserInstance(forceAuth: boolean) {
  let context: undefined | BrowserContext = undefined

  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage'],
    headless: true,
  })

  if (!forceAuth) {
    try {
      const storageData = await readFile(SESSION_STORAGE_PATH, {
        encoding: 'utf8',
      })
      const storageState = JSON.parse(storageData)
      if (DEBUG) {
        console.log('debug: session storage found: ', storageState)
      }
      context = await browser.newContext({
        storageState,
      })
      console.log(`✓ Using existing browser session.`)
    } catch (err) {
      console.log(
        `✓ Existing browser session not found. Trying to save one in ${SESSION_STORAGE_PATH}`
      )
      forceAuth = true
    }
  }

  if (forceAuth || !context) {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 1024 },
    })
  }

  // context.addCookies([
  //   {
  //     name: '_gid',
  //     value: 'X',
  //     domain: 'connect.garmin.com',
  //     path: '/',
  //   },
  //   {
  //     name: 'SESSIONID',
  //     value: 'X',
  //     domain: 'connect.garmin.com',
  //     path: '/',
  //   },
  // ])

  const page = await context.newPage()
  page.setExtraHTTPHeaders({
    'X-app-ver': GARMIN_APP_VERSION,
    'NK': 'NT',
    'content-type': 'application/json',
    'DNT': '1',
    'origin': 'https://connect.garmin.com',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'accept': 'application/json, text/plain, */*',
    // 'DI-Backend': 'connectapi.garmin.com',
    // 'TE': 'trailers',
  })

  return { browser, context, page }
}

export async function fetchData(year: string, month: string, config: fetchDataConfig) {
  return new Promise<GarminDataItem[]>(async (resolve, reject) => {
    month = `${parseInt(month) - 1}`

    const url = `https://connect.garmin.com/calendar-service/year/${year}/month/${month}`
    https: if (DEBUG) {
      console.log('debug: fetchData URL: ', url)
    }

    if (config.forceAuth) {
      try {
        await config.page.goto('https://connect.garmin.com')
        await config.page.getByText('Sign In').click()
        // await config.page.goto('https://connect.garmin.com/signin')
        await config.page.waitForSelector('form.signin__form')
        await sleep(LOGIN_DELAY_MS)

        // try {
        //   await config.page.waitForSelector('#truste-consent-button', { timeout: 1500 })
        //   await config.page.click('#truste-consent-button')
        //   console.log('#truste-consent-button clicked')
        // } catch {
        //   console.log('#truste-consent-button never came')
        // }

        if (DEBUG) {
          await sleep(LOGIN_DELAY_MS)
          await config.page.screenshot({
            path: '/Users/uninen/Code/Projects/garmin-connect-to-json/debug-00-unfilled-login.png',
            fullPage: true,
          })
        }

        await config.page.fill('input[name="email"]', process.env.GARMIN_CONNECT_USERNAME!)
        await config.page.waitForTimeout(500)
        await config.page.fill('input[name="password"]', process.env.GARMIN_CONNECT_PASSWORD!)
        await config.page.waitForTimeout(500)
        await config.page.getByText('Remember Me').check()
        await config.page.waitForTimeout(500)

        if (DEBUG) {
          await sleep(LOGIN_DELAY_MS)
          await config.page.screenshot({
            path: '/Users/uninen/Code/Projects/garmin-connect-to-json/debug-01-filled-login.png',
            fullPage: true,
          })
        }

        await config.page.locator('button[type="submit"]').click()
        await sleep(LOGIN_DELAY_MS * 2)
        if (DEBUG) {
          await config.page.screenshot({
            path: '/Users/uninen/Code/Projects/garmin-connect-to-json/debug-02-after-login.png',
            fullPage: true,
          })
        }

        // await config.page.locator('button[type="submit"]').click()
        // await sleep(LOGIN_DELAY_MS * 2)
        await config.page.waitForSelector('.main-nav')
        if (DEBUG) {
          await config.page.screenshot({
            path: '/Users/uninen/Code/Projects/garmin-connect-to-json/debug-03-after-login.png',
            fullPage: true,
          })
        }

        await config.page.goto('https://connect.garmin.com/modern/calendar')

        const storage = await config.context.storageState()
        const storageJson = JSON.stringify(storage, null, 2)
        if (DEBUG) {
          console.log('debug: session storage: ', storageJson)
        }
        await writeFile(SESSION_STORAGE_PATH, storageJson)
        console.log(`✓ Browser session created and saved to ${SESSION_STORAGE_PATH}`)
      } catch (err) {
        if (DEBUG) {
          console.log(err)
        }
        return reject(err)
      }
    }

    await config.page.goto('https://connect.garmin.com/modern/calendar')
    await sleep(LOGIN_DELAY_MS * 2)
    if (DEBUG) {
      await config.page.screenshot({
        path: '/Users/uninen/Code/Projects/garmin-connect-to-json/debug-04-calendar-home.png',
        fullPage: true,
      })
    }

    config.page
      .goto(url)
      .then(async (response) => {
        if (!response) {
          return reject(new Error('Error: no response from Garmin Connect'))
        }
        const body = await response.body()
        const bodyString = body.toString()
        if (DEBUG) {
          console.log('debug: raw data: ', bodyString)
        }

        const content = await JSON.parse(bodyString)
        process.stdout.write(` Done.\n`)
        if (DEBUG) {
          console.log('debug: resolving with: ', content.calendarItems)
        }
        return resolve(content.calendarItems)
      })
      .catch((error) => {
        console.log('Error fetching data: ', error)
        return reject(error)
      })
  })
}

export async function getExistingData(outputFile: string) {
  let existingActivitiesCount = 0
  let existingActivities: EnrichedGarminDataItem[] = []

  try {
    const contents = await readFile(outputFile, { encoding: 'utf8' })
    existingActivities = JSON.parse(contents) as EnrichedGarminDataItem[]
    existingActivitiesCount = existingActivities.length
    console.log(`✓ Found existing file with ${existingActivitiesCount} items.`)
  } catch (err) {
    console.log('No existing file found.')
  }
  return { existingActivitiesCount, existingActivities }
}

export function processActivities(activities: (GarminDataItem | EnrichedGarminDataItem)[]) {
  const sortedActivities: EnrichedGarminDataItem[] = []

  for (const obj of activities) {
    const timestamp = dayjs.tz(obj.startTimestampLocal, 'UTC').unix()
    if (timestamp) {
      sortedActivities.push({ ...obj, timestamp: timestamp })
    } else {
      if (DEBUG) {
        console.log('debug: obj.id: ', obj.id)
        console.log('debug: obj.date: ', obj.date)
      }
    }
  }

  const uniqFn = (x: EnrichedGarminDataItem, y: EnrichedGarminDataItem) => x.id === y.id
  const sortFn = (x: EnrichedGarminDataItem) => x.timestamp
  return reverse(sortBy(sortFn, uniqWith(uniqFn, sortedActivities)))
}
