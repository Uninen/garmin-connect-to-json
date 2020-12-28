const fs = require('fs/promises')
const R = require('rambda')
const dayjs = require('dayjs')
const { Command } = require('commander')
const pkg = require('../package.json')
const dotenv = require('dotenv')
const appRoot = require('app-root-path')
const path = require('path')
const { chromium } = require('playwright')

dotenv.config(path.resolve(appRoot.path, '.env'))

let data = []
let items = []
let itemsOriginally = 0
let DEBUG = false
let LOGIN_DELAY = 1100
let [searchYear, searchMonth] = dayjs().format('YYYY-M').split('-')

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
  .version(pkg.version)
  .parse(process.argv)

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function play(year, month) {
  return new Promise(async (resolve, reject) => {
    month = parseInt(month) - 1
    const browser = await chromium.launch()
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:84.0) Gecko/20100101 Firefox/84.0',
    })
    const page = await context.newPage()
    const url = `https://connect.garmin.com/modern/proxy/calendar-service/year/${year}/month/${month}`

    try {
      await page.goto('https://connect.garmin.com/signin/')
      await page.waitForSelector('iframe')
      await page
        .frames()[1]
        .fill('input[name="username"]', process.env.GARMIN_CONNECT_USERNAME)
      await page
        .frames()[1]
        .fill('input[name="password"]', process.env.GARMIN_CONNECT_PASSWORD)
      await page.frames()[1].click('#login-btn-signin')
      await page.waitForSelector('.user-profile')
      await sleep(LOGIN_DELAY)
      if (DEBUG) {
        await page.screenshot({ path: `debug-01-after-login.png` })
      }
    } catch (err) {
      if (DEBUG) {
        console.log(err)
      }
      return reject(err)
    }

    page
      .goto(url)
      .then(async (response) => {
        // console.log('<<', response.status(), response.url())
        const body = await response.body()
        content = await JSON.parse(body.toString())
        await browser.close()
        process.stdout.write(` Done.\n`)
        return resolve(content.calendarItems)
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
    items = await play(searchYear, searchMonth)
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
    data = R.reverse(R.sortBy(sortFn, R.uniqWith(uniqFn, data)))
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
