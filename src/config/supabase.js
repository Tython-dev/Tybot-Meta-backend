const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://supabase.tybot.ma/';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ4MzAwNDAwLCJleHAiOjE5MDYwNjY4MDB9.rK0_ZNxNvJIlJLhegYryYgHti-K3qRXCrtjQPudXS5Q';
const supabaseSecret = process.env.SUPABASE_JWT_SECRET || 'W7EnLVtpsr9rT9tNB1fPx3Cjbi3r2RTaA9CrSeA89Y2dmlI2tx';

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' },
  auth: {
    autoRefreshToken: true,
    persistSession: false,
  },
});

console.log('Supabase client initialized:', { url: supabaseUrl, schema: 'public' });

module.exports = { supabase, supabaseSecret };
