const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.xsmwnohozgwtliauvees:08105981273Aa@aws-1-eu-west-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected...');

  // Create game_events table
  await client.query(`
    CREATE TABLE IF NOT EXISTS game_events (
      id         BIGSERIAL PRIMARY KEY,
      room_id    TEXT NOT NULL,
      player_id  INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload    JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ game_events table created.');

  // Disable RLS on both tables (anon key must have full access)
  await client.query(`ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE game_events DISABLE ROW LEVEL SECURITY;`);
  console.log('✅ RLS disabled on rooms and game_events.');

  // Grant access to anon role
  await client.query(`GRANT ALL ON TABLE rooms TO anon;`);
  await client.query(`GRANT ALL ON TABLE game_events TO anon;`);
  await client.query(`GRANT USAGE, SELECT ON SEQUENCE game_events_id_seq TO anon;`);
  console.log('✅ Grants applied.');

  // Verify
  const r = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('rooms','game_events');`);
  console.log('✅ Tables confirmed:', r.rows.map(x => x.table_name));

  await client.end();
}

run().catch(err => { console.error(err); process.exit(1); });
