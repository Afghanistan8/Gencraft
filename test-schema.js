const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.xsmwnohozgwtliauvees:08105981273Aa@aws-1-eu-west-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    await client.connect();
    
    // Check if there's any RLS on rooms, or what the schema is
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'rooms';
    `);
    console.log("Columns:", res.rows);
    
    const res2 = await client.query(`
      SELECT * FROM rooms LIMIT 1;
    `);
    console.log("Sample row:", res2.rows);

  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await client.end();
  }
}

run();
