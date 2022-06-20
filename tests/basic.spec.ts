import { expect, test } from 'vitest'
import { fetchData, getBrowserInstance, getExistingData, processActivities } from '../src/functions'
import { EnrichedGarminDataItem } from '../src/types'

import apiResponse from './testdata/apiResponse.json'
import existingActivitiesJson from './testdata/existingActivities.json'

test('fetchData()', async () => {
  const { context, page } = await getBrowserInstance(false)

  await page.route('https://connect.garmin.com/modern/proxy/calendar-service/year/**', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify(apiResponse),
    })
  )

  await page.route('https://connect.garmin.com/modern/calendar', (route) =>
    route.fulfill({
      status: 200,
      body: '',
    })
  )

  const data = await fetchData('2022', '06', { context, page, forceAuth: false })
  expect(data).toMatchObject(apiResponse.calendarItems)
})

test('getExistingData()', async () => {
  let existingActivitiesCount = 0
  let existingActivities: EnrichedGarminDataItem[] = []

  ;({ existingActivitiesCount, existingActivities } = await getExistingData('nonexisting.json'))
  expect(existingActivitiesCount).toBe(0)
  expect(existingActivities.length).toBe(0)
  //
  ;({ existingActivitiesCount, existingActivities } = await getExistingData(
    './tests/testdata/existingActivities.json'
  ))
  expect(existingActivitiesCount).toBe(2)
  expect(existingActivities).toMatchObject(existingActivitiesJson)
})

test('processActivities()', async () => {
  const result = processActivities([...existingActivitiesJson, ...apiResponse.calendarItems])
  expect(result.length).toBe(3)
  expect(result[0].id).toBe(3)
  expect(result[0].timestamp).toBe(1655411797)
  expect(result[1].id).toBe(2)
  expect(result[1].timestamp).toBe(1654976175)
  expect(result[2].id).toBe(1)
  expect(result[2].timestamp).toBe(1654889477)
})
