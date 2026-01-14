import type { Config } from 'drizzle-kit';

const dbType = process.env.DB_TYPE || 'sqlite';

export default {
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: dbType === 'postgres' ? 'postgresql' : 'sqlite',
    dbCredentials: dbType === 'postgres'
        ? { url: process.env.DATABASE_URL! }
        : { url: process.env.SQLITE_PATH || './data/actions.db' }
} satisfies Config;
