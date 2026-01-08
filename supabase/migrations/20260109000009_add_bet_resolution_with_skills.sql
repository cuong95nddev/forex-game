-- Function to resolve bets with double skill support
CREATE OR REPLACE FUNCTION resolve_bet_with_skills(
    p_bet_id UUID,
    p_result TEXT,
    p_base_profit NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_final_profit NUMERIC;
    v_has_double BOOLEAN;
BEGIN
    -- Get the user_id from the bet
    SELECT user_id INTO v_user_id
    FROM bets
    WHERE id = p_bet_id;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bet not found');
    END IF;

    -- Initialize final profit
    v_final_profit := p_base_profit;

    -- Check if user has active double effect (only for wins)
    IF p_result = 'won' THEN
        SELECT EXISTS (
            SELECT 1 FROM active_skill_effects 
            WHERE user_id = v_user_id AND skill_type = 'double'
        ) INTO v_has_double;

        IF v_has_double THEN
            -- Double the profit
            v_final_profit := p_base_profit * 2;
            
            -- Remove the double effect after using it
            DELETE FROM active_skill_effects
            WHERE user_id = v_user_id AND skill_type = 'double';
        END IF;
    END IF;

    -- Update the bet
    UPDATE bets
    SET result = p_result,
        profit = v_final_profit
    WHERE id = p_bet_id;

    -- Update user balance
    IF p_result = 'won' THEN
        UPDATE users
        SET balance = balance + v_final_profit
        WHERE id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'final_profit', v_final_profit,
        'had_double', v_has_double,
        'user_id', v_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_bet_with_skills TO authenticated, anon;
