#!/usr/bin/env node
const fs = require('fs/promises')
const R = require('rambda')
const dayjs = require('dayjs')
const { Command } = require('commander')
const pkg = require('../package.json')
const dotenv = require('dotenv')
const appRoot = require('app-root-path')
const path = require('path')
const { chromium } = require('playwright-chromium')

dotenv.config({ path: path.resolve(appRoot.path, '.env') })

let data = []
let items = []
let itemsOriginally = 0
let DEBUG = false
let LOGIN_DELAY = 1100
let [searchYear, searchMonth] = dayjs().format('YYYY-M').split('-')
let browserStoragePath = 'browserStorage.json'
if (process.env.BROWSER_DATA_DIR) {
  browserStoragePath = process.env.BROWSER_DATA_DIR
}

const program = new Command()
program
  .option(
    '-o, --output-file <filepath>',
    'specify where to output the tweets',
    './garminData.json'
  )
  .option(
    '-m, --month <YYYY-MM>',
    'the month to fetch in YYYY-MM format (default: current month)'
  )
  .option('--fail-when-zero', 'return exit status 1 if no new items are found')
  .option('-d, --debug', 'debug (verbose) mode')
  .option('-r, --reauthenticate', 're-saves login cookies')
  .version(pkg.version)
  .parse(process.argv)

/**
 * @param {number} ms - milliseconds
 * @return {Promise}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * @param {string} year
 * @param {string} month
 * @return {Promise}
 */
async function fetchData(year, month) {
  return new Promise(async (resolve, reject) => {
    month = `${parseInt(month) - 1}`
    let context = null

    const browser = await chromium.launch({
      args: ['--disable-dev-shm-usage'],
      headless: true,
    })

    try {
      const storageData = await fs.readFile(browserStoragePath, {
        encoding: 'utf8',
      })
      const browserState = JSON.parse(storageData)
      context = await browser.newContext({
        browserState,
      })
      console.log(`✓ Using existing authentication.`)
    } catch (err) {
      context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
      })
      console.log(`✓ Using fresh browser context, will authenticate.`)
    }

    const page = await context.newPage()
    page.setExtraHTTPHeaders({
      'X-app-ver': '4.39.2.0',
      'NK': 'NT',
    })

    const url = `https://connect.garmin.com/modern/proxy/calendar-service/year/${year}/month/${month}`

    // try {
    //   await page.goto('https://connect.garmin.com/signin/')
    //   await page.waitForSelector('iframe')

    //   await page.click('#truste-consent-button')
    //   await sleep(5000)

    //   await page.frames()[1].check('#login-remember-checkbox')

    //   await page
    //     .frames()[1]
    //     .fill('input[name="username"]', process.env.GARMIN_CONNECT_USERNAME)
    //   await page
    //     .frames()[1]
    //     .fill('input[name="password"]', process.env.GARMIN_CONNECT_PASSWORD)
    //   await page.frames()[1].click('#login-btn-signin')
    //   await page.waitForSelector('.user-profile')
    //   await sleep(LOGIN_DELAY)

    //   // await page.click('#truste-show-consent')
    //   // // Agree and Proceed
    //   // await sleep(10000)
    //   // await page.click('text=Agree and Proceed')
    //   await sleep(30000)

    //   const storage = await context.storageState()
    //   const storageJson = JSON.stringify(storage)
    //   console.log('storage: ', storageJson)
    //   await fs.writeFile(storagePath, storageJson)
    //   console.log('storage written')

    //   await browser.close()

    //   // await page.goto('https://connect.garmin.com/modern/calendar')
    //   if (DEBUG) {
    //     await page.screenshot({ path: `debug-01-after-login.png` })
    //   }
    // } catch (err) {
    //   if (DEBUG) {
    //     console.log(err)
    //   }
    //   return reject(err)
    // }

    if (DEBUG) {
      console.log('getting URL: ', url)
    }

    // const response = page.waitForEvent('response', async (response) => {
    //   if (response.url() === url) {
    //     console.log('hit!')

    //     const body = await response.body()
    //     const bodyString = await body.toString()
    //     if (DEBUG) {
    //       console.log('raw data: ', bodyString)
    //     }

    //     const content = await JSON.parse(bodyString)
    //     process.stdout.write(` Done.\n`)
    //     // return resolve(content.calendarItems)

    //     return content
    //   } else {
    //     return false
    //   }
    // })

    await page.goto('https://connect.garmin.com/modern/calendar')
    if (DEBUG) {
      await page.screenshot({ path: `debug-02-calendar-home.png` })
    }
    // await page.pause()
    // await response
    // await browser.close()

    // return response

    page
      .goto(url)
      .then(async (response) => {
        // console.log('<<', response.status(), response.url())
        const body = await response.body()
        const bodyString = await body.toString()
        if (DEBUG) {
          console.log('raw data: ', bodyString)
        }

        const content = await JSON.parse(bodyString)
        await browser.close()
        process.stdout.write(` Done.\n`)
        return resolve(content.calendarItems)
        // return resolve([])
      })
      .catch((error) => {
        console.log('error fetching data: ', error)
        return reject(error)
      })
  })
}

;(async () => {
  if (!process.env.GARMIN_CONNECT_USERNAME) {
    console.error(
      'Error: GARMIN_CONNECT_USERNAME environment variable not set.'
    )
    process.exit(1)
  }
  if (!process.env.GARMIN_CONNECT_PASSWORD) {
    console.error(
      'Error: GARMIN_CONNECT_PASSWORD environment variable not set.'
    )
    process.exit(1)
  }

  DEBUG = !!program.debug

  if (program.month) {
    ;[searchYear, searchMonth] = program.month.split('-')
  }

  try {
    const contents = await fs.readFile(program.outputFile, { encoding: 'utf8' })
    data = JSON.parse(contents)
    itemsOriginally = data.length
    console.log(`✓ Found existing file with ${itemsOriginally} items.`)
  } catch (err) {
    console.log('No existing file found.')
  }

  process.stdout.write(`Querying ${searchYear}-${searchMonth}.. `)

  try {
    items = await fetchData(searchYear, searchMonth)
  } catch (err) {
    console.log('Data fetching failed.')
    process.exit(1)
  }

  if (items && items.length > 0) {
    if (DEBUG) {
      console.log(`found ${items.length} items`)
    }
    for (const obj of items) {
      const timestamp = dayjs(obj.startTimestampLocal).unix()
      if (timestamp) {
        data.push({ ...obj, timestamp: timestamp })
      } else {
        if (DEBUG) {
          console.log('obj.id: ', obj.id)
          console.log('obj.date: ', obj.date)
        }
      }
    }

    const uniqFn = (x, y) => x.id === y.id
    const sortFn = (x) => x.timestamp
    data = /** @type {any[]} */ (R.reverse(
      R.sortBy(sortFn, R.uniqWith(uniqFn, data))
    ))
  } else {
    if (DEBUG) {
      console.log(`No items found for ${searchYear}-${searchMonth}.`)
    }
    if (program.failWhenZero) {
      process.exit(1)
    }
  }

  if (data.length > itemsOriginally) {
    await fs.writeFile(program.outputFile, JSON.stringify(data, null, 2))
    console.log(`Saved ${data.length} items.`)
    process.exit(0)
  } else {
    console.log(`No new items found.`)
    if (program.failWhenZero) {
      process.exit(1)
    } else {
      process.exit(0)
    }
  }
})()
