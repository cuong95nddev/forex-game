-- Skills system migration
-- This adds the ability for users to have and use skills

-- Skill definitions table
CREATE TABLE IF NOT EXISTS public.skill_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    skill_type TEXT NOT NULL, -- 'steal', 'freeze', 'double', etc.
    cooldown_rounds INTEGER DEFAULT 0,
    parameters JSONB DEFAULT '{}', -- Flexible parameters for different skill types
    created_at TIMESTAMPTZ DEFAULT now()
);

-- User skills table (tracks which skills each user has and their cooldowns)
CREATE TABLE IF NOT EXISTS public.user_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skill_definitions(id) ON DELETE CASCADE,
    last_used_round INTEGER DEFAULT 0, -- Track when skill was last used
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, skill_id)
);

-- Skill usage history
CREATE TABLE IF NOT EXISTS public.skill_usage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES public.skill_definitions(id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- For skills that target other users
    round_number INTEGER NOT NULL,
    amount NUMERIC(10, 2) DEFAULT 0, -- For steal money skill
    result TEXT, -- Success, failed, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default steal money skill
INSERT INTO public.skill_definitions (name, description, skill_type, cooldown_rounds, parameters)
VALUES (
    'Steal Money',
    'Steal a random amount from another player',
    'steal',
    3,
    '{"min_steal_percentage": 0.05, "max_steal_percentage": 0.15}'::jsonb
);

-- Function to use steal money skill
CREATE OR REPLACE FUNCTION use_steal_money_skill(
    p_user_id UUID,
    p_target_user_id UUID,
    p_current_round INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_skill_id UUID;
    v_last_used_round INTEGER;
    v_cooldown_rounds INTEGER;
    v_target_balance NUMERIC(10, 2);
    v_steal_amount NUMERIC(10, 2);
    v_min_percentage NUMERIC;
    v_max_percentage NUMERIC;
    v_user_balance NUMERIC(10, 2);
BEGIN
    -- Get the steal money skill
    SELECT id, parameters->>'min_steal_percentage', parameters->>'max_steal_percentage', cooldown_rounds
    INTO v_skill_id, v_min_percentage, v_max_percentage, v_cooldown_rounds
    FROM skill_definitions
    WHERE skill_type = 'steal'
    LIMIT 1;

    IF v_skill_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Skill not found');
    END IF;

    -- Check if user has this skill
    SELECT last_used_round INTO v_last_used_round
    FROM user_skills
    WHERE user_id = p_user_id AND skill_id = v_skill_id AND is_active = true;

    IF v_last_used_round IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have this skill');
    END IF;

    -- Check cooldown
    IF (p_current_round - v_last_used_round) < v_cooldown_rounds THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Skill is on cooldown',
            'rounds_remaining', v_cooldown_rounds - (p_current_round - v_last_used_round)
        );
    END IF;

    -- Validate target user exists and is not the same as user
    IF p_user_id = p_target_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot use skill on yourself');
    END IF;

    -- Get target user balance
    SELECT balance INTO v_target_balance
    FROM users
    WHERE id = p_target_user_id;

    IF v_target_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
    END IF;

    -- Check if target has enough money
    IF v_target_balance < 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target has insufficient balance');
    END IF;

    -- Calculate steal amount (random percentage between min and max)
    v_steal_amount := (
        v_target_balance * (
            v_min_percentage::numeric + (RANDOM() * (v_max_percentage::numeric - v_min_percentage::numeric))
        )
    );

    -- Ensure minimum steal amount
    v_steal_amount := GREATEST(v_steal_amount, 50::numeric);
    -- Ensure we don't steal more than target has
    v_steal_amount := LEAST(v_steal_amount, v_target_balance);

    -- Deduct from target
    UPDATE users
    SET balance = balance - v_steal_amount,
        updated_at = now()
    WHERE id = p_target_user_id;

    -- Add to user
    UPDATE users
    SET balance = balance + v_steal_amount,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING balance INTO v_user_balance;

    -- Update skill cooldown
    UPDATE user_skills
    SET last_used_round = p_current_round
    WHERE user_id = p_user_id AND skill_id = v_skill_id;

    -- Record usage history
    INSERT INTO skill_usage_history (user_id, skill_id, target_user_id, round_number, amount, result)
    VALUES (p_user_id, v_skill_id, p_target_user_id, p_current_round, v_steal_amount, 'success');

    RETURN jsonb_build_object(
        'success', true,
        'amount', v_steal_amount,
        'new_balance', v_user_balance,
        'target_user_id', p_target_user_id
    );
END;
$$;

-- Grant default steal money skill to all existing users
INSERT INTO user_skills (user_id, skill_id)
SELECT u.id, s.id
FROM users u
CROSS JOIN skill_definitions s
WHERE s.skill_type = 'steal'
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- Enable RLS
ALTER TABLE skill_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_usage_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view skill definitions"
    ON skill_definitions FOR SELECT
    USING (true);

CREATE POLICY "Users can view their own skills"
    ON user_skills FOR SELECT
    USING (true);

CREATE POLICY "Users can view skill usage history"
    ON skill_usage_history FOR SELECT
    USING (true);

-- Grant necessary permissions
GRANT SELECT ON skill_definitions TO authenticated, anon;
GRANT SELECT ON user_skills TO authenticated, anon;
GRANT SELECT ON skill_usage_history TO authenticated, anon;

GRANT EXECUTE ON FUNCTION use_steal_money_skill TO authenticated, anon;
