-- Promote Reels Creator from single-shot v0 → multi-agent v1.
-- Same slug — UI/sidebar links don't change. Different model routes to
-- new orchestrator in lib/agents/reels-v1.ts that writes phase-by-phase
-- events to agent_events for live SSE streaming.

UPDATE ai_tools
   SET name        = 'Reels Creator',
       description = 'Multi-agent: Strategist → Hook Writer → Visual Director → Copywriter → QA. Каждая фаза в live timeline, на выходе готовый Reels-пакет.',
       model       = 'reels-agent-v1',
       token_cost  = 60
 WHERE slug = 'reels-creator';
