-- One-off drift fix between persona_studio DB and prisma/schema.prisma.
-- Discovered during the Research module deploy (2026-06-02). The drift
-- is pre-existing, unrelated to Research — accumulated from previous
-- declarative pushes that hit permission errors and never completed.
--
-- Apply as superuser on the postgres role that owns the `aisales-postgres`
-- instance (aisales). The `persona` role used by the app cannot ALTER
-- the `CarouselDraft` table because it doesn't own it.
--
-- Usage on prod:
--   ssh prod 'docker exec -i aisales-postgres psql -U aisales -d persona_studio' \
--     < apps/persona-studio/scripts/2026-06-02-research-drift-fix.sql
--
-- Backup taken before this fix:
--   /home/aisales/backups/persona_studio/before_research_20260602T160108Z.dump
--
-- The drift is benign (all three changes are cosmetic), but Prisma re-emits
-- them on every `db push`, blocking the command. Fixing it prevents the next
-- developer from being surprised.

BEGIN;

-- Reassign CarouselDraft from aisales to persona so future `prisma db push`
-- (which connects as persona) can ALTER it without superuser.
ALTER TABLE "CarouselDraft" OWNER TO persona;

-- CarouselDraft FKs were created without ON UPDATE CASCADE. Prisma's default
-- is ON UPDATE CASCADE. Recreate to match schema.
ALTER TABLE "CarouselDraft" DROP CONSTRAINT "CarouselDraft_coverAvatarId_fkey";
ALTER TABLE "CarouselDraft" DROP CONSTRAINT "CarouselDraft_parserItemId_fkey";
ALTER TABLE "CarouselDraft" DROP CONSTRAINT "CarouselDraft_userId_fkey";

ALTER TABLE "CarouselDraft" ADD CONSTRAINT "CarouselDraft_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarouselDraft" ADD CONSTRAINT "CarouselDraft_parserItemId_fkey"
  FOREIGN KEY ("parserItemId") REFERENCES "ParserItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CarouselDraft" ADD CONSTRAINT "CarouselDraft_coverAvatarId_fkey"
  FOREIGN KEY ("coverAvatarId") REFERENCES "Avatar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- updatedAt columns have a DB-level DEFAULT now() that Prisma doesn't manage —
-- Prisma sets these from the app layer via @updatedAt. Drop the DB default
-- to match schema (and stop Prisma from re-flagging on every push).
ALTER TABLE "CarouselDraft" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "SidebarItemOverride" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- ParserConfig: old defaults differ from schema. Schema says 1000, DB has
-- something else. Update to match.
ALTER TABLE "ParserConfig" ALTER COLUMN "minLikes" SET DEFAULT 1000;
ALTER TABLE "ParserConfig" ALTER COLUMN "minCarouselLikes" SET DEFAULT 1000;
ALTER TABLE "ParserConfig" ALTER COLUMN "minCarouselComments" SET DEFAULT 1000;

COMMIT;
