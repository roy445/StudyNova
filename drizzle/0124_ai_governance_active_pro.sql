-- StudyNova AI governance, per-user analytics and monthly active-account Pro grants.
CREATE TABLE IF NOT EXISTS active_account_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  score real NOT NULL DEFAULT 0,
  rank integer NOT NULL DEFAULT 0,
  selected boolean NOT NULL DEFAULT false,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation text NOT NULL DEFAULT '',
  pro_granted boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_account_score_period_user_uq UNIQUE (period, user_id)
);
CREATE INDEX IF NOT EXISTS active_account_score_period_idx ON active_account_scores(period, score);

CREATE TABLE IF NOT EXISTS user_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assigned_by uuid REFERENCES users(user_id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS user_titles_user_idx ON user_titles(user_id, active);

-- Governance defaults are stored in the existing platform_settings JSON store.
INSERT INTO platform_settings (key, value)
VALUES ('ai_governance_policy', '{"activeRule":{"days":30,"minSessions":4,"minFeatureUses":12,"minAiSuccessRate":0.55,"topN":10,"proDays":31},"freeLimitsNote":"一般使用者仍可使用所有已開放 AI 功能；以每日／每月配額公平分流。","proLimitsNote":"活躍帳號每月自動獲得 Pro，不涉及付費。","autoGrant":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
