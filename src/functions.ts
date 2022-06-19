import dayjs from 'dayjs'
import { readFile, writeFile } from 'fs/promises'
import { chromium } from 'playwright-chromium'
import { reverse, sortBy, uniqWith } from 'rambda'
import {
  DEBUG,
  GARMIN_APP_VERSION,
  LOGIN_DELAY_MS,
  SESSION_STORAGE_PATH,
  USER_AGENT,
} from './config'
import { fetchDataConfig, GarminCommandOptions, GarminDataItem } from './types'

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
        console.log(`✓ Existing browser session not found.`)
        config.forceAuth = true
      }
    }

    if (config.forceAuth || !context) {
      context = await browser.newContext({
        userAgent: USER_AGENT,
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
    if (DEBUG) {
      console.log('debug: fetchData URL: ', url)
    }

    if (config.forceAuth) {
      try {
        await page.goto('https://connect.garmin.com/signin')
        await page.waitForSelector('iframe')
        await sleep(LOGIN_DELAY_MS)

        try {
          await page.waitForSelector('#truste-consent-button')
          await page.click('#truste-consent-button')
          console.log('#truste-consent-button clicked')
        } catch {
          console.log('#truste-consent-button never came')
        }

        if (DEBUG) {
          await sleep(LOGIN_DELAY_MS)
          await page.screenshot({
            path: `debug-00-unfilled-login.png`,
            fullPage: true,
          })
        }

        await page.frames()[1].check('#login-remember-checkbox')
        await page.frames()[1].fill('input[name="username"]', process.env.GARMIN_CONNECT_USERNAME!)
        await page.frames()[1].fill('input[name="password"]', process.env.GARMIN_CONNECT_PASSWORD!)

        if (DEBUG) {
          await sleep(LOGIN_DELAY_MS)
          await page.screenshot({
            path: `debug-01-filled-login.png`,
            fullPage: true,
          })
        }

        await page.frames()[1].click('#login-btn-signin')
        await page.waitForSelector('.user-profile')
        await sleep(LOGIN_DELAY_MS * 2)
        if (DEBUG) {
          await page.screenshot({
            path: `debug-02-after-login.png`,
            fullPage: true,
          })
        }

        await page.goto('https://connect.garmin.com/modern/calendar')

        const storage = await context.storageState()
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

    await page.goto('https://connect.garmin.com/modern/calendar')
    await sleep(LOGIN_DELAY_MS * 2)
    if (DEBUG) {
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
        if (DEBUG) {
          console.log('debug: raw data: ', bodyString)
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

export async function getExistingData(options: GarminCommandOptions) {
  let existingActivitiesCount = 0
  let existingActivities: GarminDataItem[] = []

  try {
    const contents = await readFile(options.outputFile, { encoding: 'utf8' })
    existingActivities = JSON.parse(contents) as GarminDataItem[]
    existingActivitiesCount = existingActivities.length
    console.log(`✓ Found existing file with ${existingActivitiesCount} items.`)
  } catch (err) {
    console.log('No existing file found.')
  }
  return { existingActivitiesCount, existingActivities }
}

export function processActivities(activities: GarminDataItem[]) {
  const sortedActivities: GarminDataItem[] = []

  for (const obj of activities) {
    const timestamp = dayjs(obj.startTimestampLocal).unix()
    if (timestamp) {
      sortedActivities.push({ ...obj, timestamp: timestamp })
    } else {
      if (DEBUG) {
        console.log('debug: obj.id: ', obj.id)
        console.log('debug: obj.date: ', obj.date)
      }
    }
  }

  const uniqFn = (x: GarminDataItem, y: GarminDataItem) => x.id === y.id
  const sortFn = (x: GarminDataItem) => x.timestamp
  return reverse(sortBy(sortFn, uniqWith(uniqFn, sortedActivities)))
}
