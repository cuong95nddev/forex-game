-- Create system_configuration table for storing comprehensive system settings
CREATE TABLE system_configuration (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  data_type VARCHAR(20) NOT NULL, -- 'string', 'number', 'boolean', 'json'
  category VARCHAR(50) NOT NULL, -- 'game', 'system', 'ui', 'notification'
  description TEXT,
  is_editable BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial system configuration values
INSERT INTO system_configuration (key, value, data_type, category, description, is_editable) VALUES
  -- Game settings
  ('game.round_duration', '15', 'number', 'game', 'Thời gian mỗi vòng chơi (giây)', true),
  ('game.price_update_interval', '1', 'number', 'game', 'Tần suất cập nhật giá (giây)', true),
  ('game.win_rate', '0.95', 'number', 'game', 'Tỷ lệ thắng (95% = 0.95)', true),
  ('game.min_bet_amount', '10', 'number', 'game', 'Số tiền đặt cược tối thiểu', true),
  ('game.max_bet_amount', '10000', 'number', 'game', 'Số tiền đặt cược tối đa', true),
  ('game.default_balance', '1000', 'number', 'game', 'Số dư mặc định cho người chơi mới', true),
  ('game.auto_mode_enabled', 'true', 'boolean', 'game', 'Tự động cập nhật giá', true),
  ('game.price_volatility', '0.02', 'number', 'game', 'Độ biến động giá (2% = 0.02)', true),
  
  -- System settings
  ('system.maintenance_mode', 'false', 'boolean', 'system', 'Chế độ bảo trì', true),
  ('system.max_concurrent_users', '1000', 'number', 'system', 'Số người dùng tối đa cùng lúc', true),
  ('system.session_timeout', '3600', 'number', 'system', 'Thời gian hết phiên (giây)', true),
  ('system.enable_realtime', 'true', 'boolean', 'system', 'Bật cập nhật thời gian thực', false),
  
  -- UI settings
  ('ui.theme', 'dark', 'string', 'ui', 'Giao diện mặc định', true),
  ('ui.language', 'vi', 'string', 'ui', 'Ngôn ngữ mặc định', true),
  ('ui.show_statistics', 'true', 'boolean', 'ui', 'Hiển thị thống kê', true),
  ('ui.chart_style', 'candlestick', 'string', 'ui', 'Kiểu biểu đồ mặc định', true),
  
  -- Notification settings
  ('notification.round_start', 'true', 'boolean', 'notification', 'Thông báo khi vòng bắt đầu', true),
  ('notification.round_end', 'true', 'boolean', 'notification', 'Thông báo khi vòng kết thúc', true),
  ('notification.bet_placed', 'true', 'boolean', 'notification', 'Thông báo khi đặt cược', true),
  ('notification.bet_result', 'true', 'boolean', 'notification', 'Thông báo kết quả cược', true),
  
  -- Advanced settings
  ('advanced.enable_demo_mode', 'false', 'boolean', 'game', 'Chế độ demo (không ảnh hưởng dữ liệu thật)', true),
  ('advanced.log_level', 'info', 'string', 'system', 'Mức độ ghi log (debug, info, warn, error)', true),
  ('advanced.enable_analytics', 'true', 'boolean', 'system', 'Bật phân tích dữ liệu', true),
  ('advanced.data_retention_days', '90', 'number', 'system', 'Số ngày lưu trữ dữ liệu', true);

-- Create index for faster lookups
CREATE INDEX idx_system_configuration_key ON system_configuration(key);
CREATE INDEX idx_system_configuration_category ON system_configuration(category);

-- Enable RLS
ALTER TABLE system_configuration ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view configuration" ON system_configuration
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update editable configuration" ON system_configuration
  FOR UPDATE USING (is_editable = true);

-- Create function to get configuration value
CREATE OR REPLACE FUNCTION get_config(config_key VARCHAR)
RETURNS TEXT AS $$
DECLARE
  config_value TEXT;
BEGIN
  SELECT value INTO config_value
  FROM system_configuration
  WHERE key = config_key;
  
  RETURN config_value;
END;
$$ LANGUAGE plpgsql;

-- Create function to update configuration
CREATE OR REPLACE FUNCTION update_config(config_key VARCHAR, new_value TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  updated BOOLEAN;
BEGIN
  UPDATE system_configuration
  SET value = new_value,
      updated_at = NOW()
  WHERE key = config_key AND is_editable = true;
  
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_configuration_updated_at
  BEFORE UPDATE ON system_configuration
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for configuration changes
ALTER PUBLICATION supabase_realtime ADD TABLE system_configuration;

-- Add comment to table
COMMENT ON TABLE system_configuration IS 'Bảng cấu hình hệ thống với các giá trị khởi tạo';
