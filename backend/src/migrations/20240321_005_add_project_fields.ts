exports.up = async function (pgm) {
    await pgm.sql(`
        ALTER TABLE onstrument.tokens
        ADD COLUMN IF NOT EXISTS project_category varchar(50),
        ADD COLUMN IF NOT EXISTS team_members jsonb,
        ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS project_title varchar(255),
        ADD COLUMN IF NOT EXISTS project_description text,
        ADD COLUMN IF NOT EXISTS project_story text;
    `);
};

exports.down = async function (pgm) {
    await pgm.sql(`
        ALTER TABLE onstrument.tokens
        DROP COLUMN IF EXISTS project_category,
        DROP COLUMN IF EXISTS team_members,
        DROP COLUMN IF EXISTS is_anonymous,
        DROP COLUMN IF EXISTS project_title,
        DROP COLUMN IF EXISTS project_description,
        DROP COLUMN IF EXISTS project_story;
    `);
}; 