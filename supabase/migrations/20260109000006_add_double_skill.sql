-- Add double skill and active effects tracking

-- Add table to track active skill effects
CREATE TABLE IF NOT EXISTS public.active_skill_effects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    skill_type TEXT NOT NULL,
    effect_data JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, skill_type)
);

-- Insert double skill definition
INSERT INTO public.skill_definitions (name, description, skill_type, cooldown_rounds, parameters)
VALUES (
    'Double Profit',
    'Your next winning bet will have 2x profit',
    'double',
    5,
    '{}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Grant default double skill to all existing users
INSERT INTO user_skills (user_id, skill_id)
SELECT u.id, s.id
FROM users u
CROSS JOIN skill_definitions s
WHERE s.skill_type = 'double'
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- Function to use double skill
CREATE OR REPLACE FUNCTION use_double_skill(
    p_user_id UUID,
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
BEGIN
    -- Get the double skill
    SELECT id, cooldown_rounds
    INTO v_skill_id, v_cooldown_rounds
    FROM skill_definitions
    WHERE skill_type = 'double'
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

    -- Check if effect is already active
    IF EXISTS (SELECT 1 FROM active_skill_effects WHERE user_id = p_user_id AND skill_type = 'double') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Double effect already active');
    END IF;

    -- Activate the double effect
    INSERT INTO active_skill_effects (user_id, skill_type, effect_data)
    VALUES (p_user_id, 'double', '{}'::jsonb)
    ON CONFLICT (user_id, skill_type) 
    DO UPDATE SET created_at = now();

    -- Update skill cooldown
    UPDATE user_skills
    SET last_used_round = p_current_round
    WHERE user_id = p_user_id AND skill_id = v_skill_id;

    -- Record usage history
    INSERT INTO skill_usage_history (user_id, skill_id, target_user_id, round_number, amount, result)
    VALUES (p_user_id, v_skill_id, NULL, p_current_round, 0, 'success');

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Double profit activated for next win!'
    );
END;
$$;

-- Enable RLS
ALTER TABLE active_skill_effects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own active effects"
    ON active_skill_effects FOR SELECT
    USING (true);

CREATE POLICY "Users can delete their own active effects"
    ON active_skill_effects FOR DELETE
    USING (auth.uid()::text = user_id::text);

-- Grant permissions
GRANT SELECT, DELETE ON active_skill_effects TO authenticated, anon;
GRANT EXECUTE ON FUNCTION use_double_skill TO authenticated, anon;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE active_skill_effects;
