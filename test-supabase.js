const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xsmwnohozgwtliauvees.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbXdub2hvemd3dGxpYXV2ZWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDUzNjEsImV4cCI6MjA5MTQyMTM2MX0.u_Hj594JZ0ZEkHPc8j0lWQZAVCHniykcCVrnK7COZhk';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  console.log("1. Testing insert...");
  const roomId = 'DEBUG_' + Math.floor(Math.random() * 10000);
  
  const { data: iData, error: iErr } = await supabase.from('rooms').insert({
    id: roomId,
    player1_name: 'TEST1',
    status: 'waiting',
    question_seed: 123
  });
  
  console.log("Insert result:", { iErr, iData });
  
  console.log("2. Testing basic select...");
  const { data: sData, error: sErr } = await supabase.from('rooms').select('*').eq('id', roomId);
  console.log("Select result:", { sErr, sData });

  console.log("3. Testing ALL rooms select limit 5...");
  const { data: aData } = await supabase.from('rooms').select('id, status').limit(5);
  console.log("All rooms:", aData);
}

test();
