#!/usr/bin/env node

import axios from 'axios';
import crypto from 'crypto';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_SECRET = process.env.LASTFM_SECRET;
const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

if (!LASTFM_API_KEY || !LASTFM_SECRET) {
  console.error('Error: LASTFM_API_KEY and LASTFM_SECRET are required');
  console.error('Please set these in your environment variables');
  process.exit(1);
}

function signLastFmParams(params) {
  const signatureBase = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join('');

  return crypto
    .createHash('md5')
    .update(`${signatureBase}${LASTFM_SECRET}`)
    .digest('hex');
}

console.log('Last.fm Session Key Generator');
console.log('============================');

const authUrl = `https://www.last.fm/api/auth/?api_key=${LASTFM_API_KEY}`;
console.log('\n1. Visit this URL to authorize the application:');
console.log(authUrl);
console.log('\n2. After authorizing, you will receive a token.');
console.log('3. Copy the token from the URL and run this script again with the token:');
console.log('   node get-session-key.js <your_token_here>');

const token = process.argv[2];

if (token) {
  const params = {
    method: 'auth.getSession',
    api_key: LASTFM_API_KEY,
    token,
  };

  params.api_sig = signLastFmParams(params);
  params.format = 'json';

  try {
    const response = await axios.get(LASTFM_API_URL, { params, timeout: 10000 });
    const session = response.data.session;

    if (!session) {
      throw new Error('No session returned by Last.fm');
    }

    console.log('\nSuccess! Here is your session information:');
    console.log('==========================================');
    console.log(`Username: ${session.name}`);
    console.log(`Session Key: ${session.key}`);
    console.log('\nAdd these lines to your .env file:');
    console.log(`LASTFM_USERNAME=${session.name}`);
    console.log(`LASTFM_SESSION_KEY=${session.key}`);
  } catch (error) {
    console.error('\nError getting session:', error.response?.data || error.message);
    process.exit(1);
  }
}
