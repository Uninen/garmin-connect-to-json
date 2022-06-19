import { setupServer } from 'msw/node'
import { handlers } from './handlers'
// This configures a Service Worker with the given request handlers.
console.log('server started')
export const server = setupServer(...handlers)
