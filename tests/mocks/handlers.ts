import { rest } from 'msw'

import apiResponse from '../testdata/apiResponse.json'

export const handlers = [
  rest.get('https://connect.garmin.com/modern/proxy/calendar-service/year/*', (req, res, ctx) => {
    console.log('calendar API called')
    return res(ctx.status(200), ctx.json(apiResponse))
  }),

  rest.get('https://connect.garmin.com/modern/calendar', (req, res, ctx) => {
    console.log('calendar page called')
    return res(ctx.status(200), ctx.json({}))
  }),
]
