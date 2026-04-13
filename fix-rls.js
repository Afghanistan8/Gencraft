const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.xsmwnohozgwtliauvees:08105981273Aa@aws-1-eu-west-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log("Connected...");

    // Check if RLS is enabled on rooms
    const rls = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname = 'rooms';
    `);
    console.log("RLS status:", rls.rows);

    // Disable RLS entirely on rooms (simplest fix for a game)
    await client.query(`ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;`);
    console.log("✅ RLS disabled on rooms.");

    // Grant full access to anon role
    await client.query(`GRANT ALL ON TABLE rooms TO anon;`);
    await client.query(`GRANT ALL ON TABLE rooms TO authenticated;`);
    console.log("✅ Grants applied to anon and authenticated roles.");

    // Verify
    const check = await client.query(`SELECT * FROM rooms LIMIT 1;`);
    console.log("✅ Test select works:", check.rows.length, "row(s)");

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await client.end();
  }
}

run();
