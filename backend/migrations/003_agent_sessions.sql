-- Migration: Create agent_sessions table for Managed Agents chat
-- Run this on your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  anthropic_session_id TEXT NOT NULL,
  agent_module TEXT NOT NULL DEFAULT 'supervisor',
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_anthropic ON agent_sessions (anthropic_session_id);
