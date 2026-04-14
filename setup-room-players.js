const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.xsmwnohozgwtliauvees:08105981273Aa@aws-1-eu-west-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected...');

  // Create room_players table
  await client.query(`
    CREATE TABLE IF NOT EXISTS room_players (
      id         BIGSERIAL PRIMARY KEY,
      room_id    TEXT NOT NULL,
      player_num INTEGER NOT NULL,
      name       TEXT NOT NULL,
      score      INTEGER DEFAULT 0,
      finished   BOOLEAN DEFAULT false,
      joined_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ room_players table created.');

  // Disable RLS on room_players
  await client.query(`ALTER TABLE room_players DISABLE ROW LEVEL SECURITY;`);
  console.log('✅ RLS disabled on room_players.');

  // Grant access to anon
  await client.query(`GRANT ALL ON TABLE room_players TO anon;`);
  await client.query(`GRANT USAGE, SELECT ON SEQUENCE room_players_id_seq TO anon;`);
  console.log('✅ Grants applied to anon.');

  // Add to realtime publication
  try {
    await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;`);
    console.log('✅ room_players added to supabase_realtime.');
  } catch(e) {
    console.log('ℹ realtime:', e.message);
  }

  // Verify all tables
  const r = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name IN ('rooms','game_events','room_players')
    ORDER BY table_name;
  `);
  console.log('✅ All tables:', r.rows.map(x => x.table_name));

  await client.end();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
