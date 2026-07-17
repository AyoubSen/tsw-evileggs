import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'

export function createDatabase(databaseUrl: string) {
  neonConfig.poolQueryViaFetch = true
  const pool = new Pool({ connectionString: databaseUrl })
  return drizzle(pool, { schema })
}

export type AccountDatabase = ReturnType<typeof createDatabase>
