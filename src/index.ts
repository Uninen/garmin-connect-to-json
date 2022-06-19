import { Command } from 'commander'
import dayjs from 'dayjs'
import dotenv from 'dotenv'
import { writeFile } from 'fs/promises'
import { version } from '../package.json'
import { DEBUG } from './config'
import { fetchData, readExistingFile, sortAndFilterActivities } from './functions'

import type { GarminCommandOptions } from './types'

dotenv.config()

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

  if (DEBUG) {
    console.log('DEBUG mode enabled.')
  }

  if (progOptions.month) {
    ;[searchYear, searchMonth] = progOptions.month.split('-')
  }

  const { existingActivitiesCount, existingActivities } = await readExistingFile(progOptions)

  process.stdout.write(`Querying ${searchYear}-${searchMonth}.. `)
  try {
    const newActivities = await fetchData(searchYear, searchMonth, {
      forceAuth,
      browserStoragePath,
    })

    if (newActivities.length > 0) {
      if (DEBUG) {
        console.log(`debug: found ${newActivities.length} items`)
      }
      const allActivities = [...existingActivities, ...newActivities]
      const data = sortAndFilterActivities(allActivities)

      if (data.length > existingActivitiesCount) {
        await writeFile(progOptions.outputFile, JSON.stringify(data, null, 2))
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
    } else {
      if (DEBUG) {
        console.log(`debug: no items found for ${searchYear}-${searchMonth}.`)
      }
      if (progOptions.failWhenZero) {
        process.exit(1)
      }
    }
  } catch (err) {
    console.log('Data fetching failed.')
    process.exit(1)
  }
})()
