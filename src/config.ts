export const DEBUG = process.env.GARMIN_CONNECT_DEBUG
export const GARMIN_APP_VERSION = '4.59.2.0'
export const LOGIN_DELAY_MS = 1100
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36'

export const SESSION_STORAGE_PATH = process.env.SESSION_STORAGE_PATH
  ? process.env.SESSION_STORAGE_PATH
  : 'sessionStorage.json'
