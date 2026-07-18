import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { AccountPreferences } from '../../src/shared/account'
import type { PlayerAppearance } from '../../src/players/appearanceRegistry'

export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  revision: integer('revision').notNull().default(0),
  preferences: jsonb('preferences').$type<AccountPreferences>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const outfitPresets = pgTable('outfit_presets', {
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  name: text('name').notNull(),
  appearance: jsonb('appearance').$type<PlayerAppearance>(),
  deleted: boolean('deleted').notNull().default(false),
  position: integer('position').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  serverRevision: integer('server_revision').notNull(),
}, (table) => [primaryKey({ columns: [table.profileId, table.id] })])

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
})

export const progressionProfiles = pgTable('progression_profiles', {
  profileId: uuid('profile_id').primaryKey().references(() => profiles.id, { onDelete: 'cascade' }),
  experience: integer('experience').notNull().default(0),
  currencyBalance: integer('currency_balance').notNull().default(0),
  roomsCreated: integer('rooms_created').notNull().default(0),
  matchesPlayed: integer('matches_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const onlineMatches = pgTable('online_matches', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(), mapId: text('map_id').notNull(), reason: text('reason').notNull(),
  winnerTeamId: integer('winner_team_id'), isDraw: boolean('is_draw').notNull().default(false),
  turnsTaken: integer('turns_taken').notNull(), durationSeconds: integer('duration_seconds').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
})

export const matchParticipants = pgTable('match_participants', {
  matchId: text('match_id').notNull().references(() => onlineMatches.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  seat: integer('seat').notNull(), teamId: integer('team_id').notNull(), outcome: text('outcome').notNull(),
  experienceEarned: integer('experience_earned').notNull(), currencyEarned: integer('currency_earned').notNull(),
}, (table) => [primaryKey({ columns: [table.matchId, table.profileId] })])

export const currencyLedger = pgTable('currency_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), reason: text('reason').notNull(), referenceId: text('reference_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('currency_ledger_profile_reason_reference').on(table.profileId, table.reason, table.referenceId)])

export const cosmeticEntitlements = pgTable('cosmetic_entitlements', {
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  cosmeticId: text('cosmetic_id').notNull(), source: text('source').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.profileId, table.cosmeticId] })])
