-- Add DELETE policies for rounds and bets tables
CREATE POLICY "Anyone can delete rounds" ON rounds
  FOR DELETE USING (true);

CREATE POLICY "Anyone can delete bets" ON bets
  FOR DELETE USING (true);

-- Also add DELETE policy for gold_prices if not exists
CREATE POLICY "Anyone can delete gold prices" ON gold_prices
  FOR DELETE USING (true);
