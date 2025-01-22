exports.up = async function (pgm) {
    await pgm.sql(`
    DO $$ 
    BEGIN 
      -- Add subscription_expires_at if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'onstrument' 
        AND table_name = 'users' 
        AND column_name = 'subscription_expires_at'
      ) THEN
        ALTER TABLE onstrument.users ADD COLUMN subscription_expires_at timestamptz;
      END IF;

      -- Add is_subscribed if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'onstrument' 
        AND table_name = 'users' 
        AND column_name = 'is_subscribed'
      ) THEN
        ALTER TABLE onstrument.users ADD COLUMN is_subscribed boolean DEFAULT false;
      END IF;

      -- Add subscription_tier if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'onstrument' 
        AND table_name = 'users' 
        AND column_name = 'subscription_tier'
      ) THEN
        ALTER TABLE onstrument.users ADD COLUMN subscription_tier text;
      END IF;

      -- Add golden_points if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'onstrument' 
        AND table_name = 'users' 
        AND column_name = 'golden_points'
      ) THEN
        ALTER TABLE onstrument.users ADD COLUMN golden_points integer DEFAULT 0;
      END IF;
    END $$;
  `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
    ALTER TABLE onstrument.users
    DROP COLUMN IF EXISTS subscription_expires_at,
    DROP COLUMN IF EXISTS is_subscribed,
    DROP COLUMN IF EXISTS subscription_tier,
    DROP COLUMN IF EXISTS golden_points;
  `);
}; 