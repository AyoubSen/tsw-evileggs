CREATE TABLE "cosmetic_entitlements" (
	"profile_id" uuid NOT NULL,
	"cosmetic_id" text NOT NULL,
	"source" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cosmetic_entitlements_profile_id_cosmetic_id_pk" PRIMARY KEY("profile_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE "currency_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"reference_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"team_id" integer NOT NULL,
	"outcome" text NOT NULL,
	"experience_earned" integer NOT NULL,
	"currency_earned" integer NOT NULL,
	CONSTRAINT "match_participants_match_id_profile_id_pk" PRIMARY KEY("match_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "online_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"map_id" text NOT NULL,
	"reason" text NOT NULL,
	"winner_team_id" integer,
	"is_draw" boolean DEFAULT false NOT NULL,
	"turns_taken" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progression_profiles" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"currency_balance" integer DEFAULT 0 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cosmetic_entitlements" ADD CONSTRAINT "cosmetic_entitlements_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_ledger" ADD CONSTRAINT "currency_ledger_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_online_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."online_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progression_profiles" ADD CONSTRAINT "progression_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "currency_ledger_profile_reason_reference" ON "currency_ledger" USING btree ("profile_id","reason","reference_id");