import { listen } from '@colyseus/tools'
import { server } from './app.config'

const port = Number(process.env.PORT ?? 2567)
if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid TCP port')

await listen(server, port)
