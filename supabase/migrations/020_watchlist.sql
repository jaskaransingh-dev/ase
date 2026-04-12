-- Create watchlist table for tracking agents without investing
CREATE TABLE IF NOT EXISTS watchlist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, agent_id)
);

-- Index
CREATE INDEX IF NOT EXISTS watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS watchlist_agent ON watchlist(agent_id);

-- Enable RLS
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own watchlist"
    ON watchlist FOR select USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist"
    ON watchlist FOR insert WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist"
    ON watchlist FOR delete USING (auth.uid() = user_id);