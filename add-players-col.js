const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.xsmwnohozgwtliauvees:08105981273Aa@aws-1-eu-west-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to database...");
    
    // Add the players column
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS players text DEFAULT '[]';`);
    console.log("Successfully added 'players' column to 'rooms' table.");
    
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await client.end();
  }
}

run();
