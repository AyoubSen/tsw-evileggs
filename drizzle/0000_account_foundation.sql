CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE "profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "clerk_user_id" text NOT NULL UNIQUE,
  "revision" integer DEFAULT 0 NOT NULL,
  "preferences" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "outfit_presets" (
  "profile_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "id" text NOT NULL,
  "name" text NOT NULL,
  "appearance" jsonb,
  "deleted" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "server_revision" integer NOT NULL,
  PRIMARY KEY ("profile_id", "id"),
  CHECK (("deleted" AND "appearance" IS NULL) OR (NOT "deleted" AND "appearance" IS NOT NULL))
);
CREATE TABLE "webhook_events" (
  "id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "processed_at" timestamptz DEFAULT now() NOT NULL
);
