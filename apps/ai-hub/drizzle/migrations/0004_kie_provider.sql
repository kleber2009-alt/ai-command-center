-- Add 'kie' to the provider check constraint on ai_tools.
-- kie.ai is a unified marketplace (Nano Banana 2, Veo, Kling, ...) accessed
-- via single Bearer-key API. Used for our first featured product Nano Banana 2.

alter table "ai_tools" drop constraint if exists "ai_tools_provider_check";
alter table "ai_tools" add constraint "ai_tools_provider_check"
  check (provider in ('fal','replicate','kling','runware','modelslab','internal','kie'));
