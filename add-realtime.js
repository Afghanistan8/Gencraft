const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.xsmwnohozgwtliauvees:08105981273Aa@aws-1-eu-west-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected...');

  try {
    await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;');
    console.log('✅ rooms added to supabase_realtime publication.');
  } catch (e) {
    console.log('⚠ rooms:', e.message);
  }

  try {
    await client.query('ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;');
    console.log('✅ room_players added to supabase_realtime publication.');
  } catch (e) {
    console.log('⚠ room_players:', e.message);
  }

  await client.end();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
