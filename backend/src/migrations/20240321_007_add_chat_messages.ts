exports.up = async function (pgm) {
    await pgm.sql(`
        CREATE TABLE IF NOT EXISTS onstrument.chat_messages (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES onstrument.users(user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON onstrument.chat_messages(created_at);
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        DROP TABLE IF EXISTS onstrument.chat_messages;
    `);
}; 