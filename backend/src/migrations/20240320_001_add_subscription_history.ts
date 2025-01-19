exports.up = async function (pgm) {
    // First verify the table doesn't exist to be safe
    await pgm.sql(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'onstrument' 
        AND table_name = 'subscription_history'
      ) THEN
        CREATE TABLE onstrument.subscription_history (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES onstrument.users(user_id),
          payment_tx_id text NOT NULL,
          tier_type text NOT NULL,
          amount_paid decimal NOT NULL,
          duration_months integer NOT NULL,
          started_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX idx_subscription_history_user_id ON onstrument.subscription_history(user_id);
        CREATE UNIQUE INDEX idx_subscription_history_payment_tx ON onstrument.subscription_history(payment_tx_id);
      END IF;
    END $$;
  `);
};

exports.down = async function (pgm) {
    // Be extra careful with down migrations in prod
    await pgm.sql(`
    DO $$ 
    BEGIN 
      IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'onstrument' 
        AND table_name = 'subscription_history'
      ) THEN
        DROP TABLE onstrument.subscription_history;
      END IF;
    END $$;
  `);
}; 