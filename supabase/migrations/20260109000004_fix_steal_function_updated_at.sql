-- Fix the use_steal_money_skill function - remove updated_at references
DROP FUNCTION IF EXISTS use_steal_money_skill(UUID, UUID, INTEGER);

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
    SELECT id, (parameters->>'min_steal_percentage')::numeric, (parameters->>'max_steal_percentage')::numeric, cooldown_rounds
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
            v_min_percentage + (RANDOM() * (v_max_percentage - v_min_percentage))
        )
    );

    -- Ensure minimum steal amount and round to 2 decimals
    v_steal_amount := GREATEST(v_steal_amount, 50::numeric);
    -- Ensure we don't steal more than target has
    v_steal_amount := LEAST(v_steal_amount, v_target_balance);

    -- Deduct from target
    UPDATE users
    SET balance = balance - v_steal_amount
    WHERE id = p_target_user_id;

    -- Add to user
    UPDATE users
    SET balance = balance + v_steal_amount
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

GRANT EXECUTE ON FUNCTION use_steal_money_skill TO authenticated, anon;
