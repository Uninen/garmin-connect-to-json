import { describe, expect, test } from 'vitest'
import { fetchData, getBrowserInstance } from '../src/functions'

import apiResponse from './testdata/apiResponse.json'

describe('Test API Calls', () => {
  test('fetchData', async () => {
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
  }, 30000)
})
