import { describe, expect, test } from 'vitest'
import { fetchData } from '../src/functions'

describe('example test', () => {
  test('assert', async () => {
    expect(await fetchData('2022', '06', { forceAuth: false })).toEqual(3)
  }, 20000)
})
