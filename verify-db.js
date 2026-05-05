const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.xsmwnohozgwtliauvees:08105981273Aa@aws-1-eu-west-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected...');

  // Confirm RLS is still disabled on all our tables
  const rls = await client.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE tablename IN ('rooms', 'room_players', 'game_events')
    AND schemaname = 'public';
  `);
  console.log('\nRLS status:');
  rls.rows.forEach(r => {
    console.log('  ' + r.tablename + ': RLS=' + (r.rowsecurity ? '🔴 ENABLED (bad)' : '✅ DISABLED (good)'));
  });

  // Confirm anon grants are in place
  const grants = await client.query(`
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
    AND table_name IN ('rooms', 'room_players', 'game_events')
    ORDER BY table_name, privilege_type;
  `);
  console.log('\nAnon grants:');
  if (grants.rows.length === 0) {
    console.log('  ⚠ No grants found — re-applying...');
    await client.query(`GRANT ALL ON TABLE rooms TO anon;`);
    await client.query(`GRANT ALL ON TABLE room_players TO anon;`);
    await client.query(`GRANT ALL ON TABLE game_events TO anon;`);
    await client.query(`GRANT USAGE, SELECT ON SEQUENCE room_players_id_seq TO anon;`);
    await client.query(`GRANT USAGE, SELECT ON SEQUENCE game_events_id_seq TO anon;`);
    console.log('  ✅ Grants re-applied.');
  } else {
    grants.rows.forEach(r => console.log('  ✅ ' + r.table_name + ' → ' + r.grantee + ': ' + r.privilege_type));
  }

  // Make sure RLS is off (re-disable just in case)
  await client.query(`ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE room_players DISABLE ROW LEVEL SECURITY;`);
  await client.query(`ALTER TABLE game_events DISABLE ROW LEVEL SECURITY;`);
  console.log('\n✅ RLS confirmed disabled on all tables.');

  await client.end();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
