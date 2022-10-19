import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { readFile, writeFile } from 'node:fs/promises'
import type { BrowserContext, Page } from 'playwright-chromium'
import { chromium } from 'playwright-chromium'
import { reverse, sortBy, uniqWith } from 'rambda'
import {
  DEBUG,
  GARMIN_APP_VERSION,
  LOGIN_DELAY_MS,
  SESSION_STORAGE_PATH,
  USER_AGENT,
} from './config'
import { EnrichedGarminDataItem, fetchDataConfig, GarminDataItem } from './types'

import StreamZip from 'node-stream-zip'

dayjs.extend(utc)
dayjs.extend(timezone)

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function authenticate(context: BrowserContext, page: Page) {
  if (DEBUG) {
    console.log('debug: authenticating session')
  }
  try {
    await page.goto('https://connect.garmin.com/signin')
    await page.waitForSelector('iframe')
    await sleep(LOGIN_DELAY_MS)
    try {
      await page.waitForSelector('#truste-consent-button', { timeout: 500 })
      await page.click('#truste-consent-button')
      console.log('#truste-consent-button clicked')
    } catch {
      console.log('#truste-consent-button never came')
    }

    if (DEBUG) {
      await sleep(LOGIN_DELAY_MS)
      await page.screenshot({
        path: 'debug-00-unfilled-login.png',
        fullPage: true,
      })
    }

    await page.frames()[1].check('#login-remember-checkbox')
    await page.frames()[1].fill('input[name="username"]', process.env.GARMIN_CONNECT_USERNAME!)
    await page.frames()[1].fill('input[name="password"]', process.env.GARMIN_CONNECT_PASSWORD!)

    if (DEBUG) {
      await sleep(LOGIN_DELAY_MS)
      await page.screenshot({
        path: 'debug-01-filled-login.png',
        fullPage: true,
      })
    }

    await page.frames()[1].click('#login-btn-signin')
    await page.waitForSelector('.user-profile')
    await sleep(LOGIN_DELAY_MS * 2)
    if (DEBUG) {
      await page.screenshot({
        path: 'debug-02-after-login.png',
        fullPage: true,
      })
    }

    await page.goto('https://connect.garmin.com/modern/calendar')

    const storage = await context.storageState()
    const storageJson = JSON.stringify(storage, null, 2)
    // if (DEBUG) {
    //   console.log('debug: session storage: ', storageJson)
    // }
    await writeFile(SESSION_STORAGE_PATH, storageJson)
    console.log(`✓ Browser session created and saved to ${SESSION_STORAGE_PATH}`)
  } catch (error) {
    if (DEBUG) {
      console.log(error)
    }
    process.exit(1)
  }
  return { context, page }
}

export async function getBrowserInstance(forceAuth: boolean) {
  let context: undefined | BrowserContext = undefined

  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage'],
    headless: true,
    // acceptDownloads: true,
  })

  if (!forceAuth) {
    try {
      const storageData = await readFile(SESSION_STORAGE_PATH, {
        encoding: 'utf8',
      })
      const storageState = JSON.parse(storageData)
      // if (DEBUG) {
      //   console.log('debug: session storage found: ', storageState)
      // }
      context = await browser.newContext({
        storageState,
      })
      console.log(`✓ Using existing browser session.`)
    } catch (err) {
      console.log(`✓ Existing browser session not found.`)
      forceAuth = true
    }
  }

  if (forceAuth || !context) {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 1024 },
    })
  }

  let page = await context.newPage()
  page.setExtraHTTPHeaders({
    'X-app-ver': GARMIN_APP_VERSION,
    'NK': 'NT',
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
  })

  if (forceAuth) {
    const { context: authContext, page: authPpage } = await authenticate(context, page)
    context = authContext
    page = authPpage
  }

  return { browser, context, page, forceAuth }
}

export async function downloadFitFile(context: BrowserContext, id: number) {
  // const url = `https://connect.garmin.com/modern/activity/9790320910`
  // const url = `https://connect.garmin.com/modern/activity/${id}`
  // console.log('id: ', id)
  const url = `https://connect.garmin.com/modern/proxy/download-service/files/activity/${id}`
  const filename = `./${id}.fit.zip`
  const filename2 = `./${id}.fit`

  console.log('downloading fit from: ', url)

  const response = await context.request.get(url)
  const body = await response.body()
  console.log('response body: ', body)
  await writeFile(filename, body)

  // const contents = await readFile(filename)

  // const fileContents = createReadStream(filename)
  // const writeStream = createWriteStream(filename2)
  // const unzip = createUnzip()

  // fileContents.pipe(unzip).pipe(writeStream)

  const zip = new StreamZip.async({ file: filename })
  await zip.extract(null, './')
  await zip.close()

  // unzip(contents, async (err, buffer) => {
  //   if (err) {
  //     console.error('unzip error:', err)
  //     process.exitCode = 1
  //   }
  //   await writeFile(filename2, buffer)
  // })
}

export async function fetchData(year: string, month: string, config: fetchDataConfig) {
  return new Promise<GarminDataItem[]>(async (resolve, reject) => {
    month = `${parseInt(month) - 1}`

    const url = `https://connect.garmin.com/modern/proxy/calendar-service/year/${year}/month/${month}`
    if (DEBUG) {
      console.log('debug: fetchData URL: ', url)
    }

    await config.page.goto('https://connect.garmin.com/modern/calendar')
    await sleep(LOGIN_DELAY_MS * 2)
    if (DEBUG) {
      await config.page.screenshot({
        path: 'debug-03-calendar-home.png',
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
        // if (DEBUG) {
        //   console.log('debug: raw data: ', bodyString)
        // }

        const content = await JSON.parse(bodyString)
        process.stdout.write(` Done.\n`)
        // if (DEBUG) {
        //   console.log('debug: resolving with: ', content.calendarItems)
        // }
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

/**
 * Order activities by timestamp and adds 'timestamp' attribute.
 */
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
