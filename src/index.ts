import { Command } from 'commander'
import dayjs from 'dayjs'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import { reverse, sortBy, uniqWith } from 'rambda'
import { version } from '../package.json'
import { fetchData } from './functions'

import type { GarminCommandOptions, GarminDataItem } from './types'

dotenv.config()

let data: GarminDataItem[] = []
let items: GarminDataItem[] = []
let existingActivitiesCount = 0
let DEBUG = false
let [searchYear, searchMonth] = dayjs().format('YYYY-M').split('-')
let browserStoragePath = 'sessionStorage.json'
if (process.env.SESSION_STORAGE_PATH) {
  browserStoragePath = process.env.SESSION_STORAGE_PATH
}

const program = new Command()
program
  .option('-o, --output-file <filepath>', 'specify where to output the tweets', './garminData.json')
  .option('-m, --month <YYYY-MM>', 'the month to fetch in YYYY-MM format (default: current month)')
  .option('--fail-when-zero', 'return exit status 1 if no new items are found')
  .option('-d, --debug', 'debug (verbose) mode')
  .option('-a, --authenticate', 'forces authentication')
  .helpOption('-h --help', 'display this help message')
  .version(version)
  .parse(process.argv)

const progOptions = program.opts() as GarminCommandOptions

const forceAuth = !!progOptions.authenticate

;(async () => {
  if (!process.env.GARMIN_CONNECT_USERNAME) {
    console.error('Error: GARMIN_CONNECT_USERNAME environment variable not set.')
    process.exit(1)
  }
  if (!process.env.GARMIN_CONNECT_PASSWORD) {
    console.error('Error: GARMIN_CONNECT_PASSWORD environment variable not set.')
    process.exit(1)
  }

  DEBUG = !!progOptions.debug

  if (DEBUG) {
    console.log('DEBUG mode enabled.')
  }

  if (progOptions.month) {
    ;[searchYear, searchMonth] = progOptions.month.split('-')
  }

  try {
    const contents = await fs.readFile(progOptions.outputFile, { encoding: 'utf8' })
    data = JSON.parse(contents) as GarminDataItem[]
    existingActivitiesCount = data.length
    console.log(`✓ Found existing file with ${existingActivitiesCount} items.`)
  } catch (err) {
    console.log('No existing file found.')
  }

  process.stdout.write(`Querying ${searchYear}-${searchMonth}.. `)

  try {
    items = await fetchData(searchYear, searchMonth, {
      debug: DEBUG,
      forceAuth,
      browserStoragePath,
    })
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

    const uniqFn = (x: GarminDataItem, y: GarminDataItem) => x.id === y.id
    const sortFn = (x: GarminDataItem) => x.timestamp
    data = reverse(sortBy(sortFn, uniqWith(uniqFn, data)))
  } else {
    if (DEBUG) {
      console.log(`No items found for ${searchYear}-${searchMonth}.`)
    }
    if (progOptions.failWhenZero) {
      process.exit(1)
    }
  }

  if (data.length > existingActivitiesCount) {
    await fs.writeFile(progOptions.outputFile, JSON.stringify(data, null, 2))
    console.log(`Saved ${data.length} items.`)
    process.exit(0)
  } else {
    console.log(`No new items found.`)
    if (progOptions.failWhenZero) {
      process.exit(1)
    } else {
      process.exit(0)
    }
  }
})()
