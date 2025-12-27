#!/usr/bin/env node

// Script to help obtain a Last.fm session key
// This script will generate an authentication URL that you need to visit
// to authorize the application, then use the token to get a session key

import { LastFmNode } from 'lastfm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.join(__dirname, '.env');
let config = {};

if (fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, 'utf8');
  const lines = configContent.split('\n');
  for (const line of lines) {
    const [key, value] = line.split('=');
    if (key && value) {
      config[key.trim()] = value.trim();
    }
  }
}

// Check for environment variables (takes precedence over .env file)
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || config.LASTFM_API_KEY;
const LASTFM_SECRET = process.env.LASTFM_SECRET || config.LASTFM_SECRET;

if (!LASTFM_API_KEY || !LASTFM_SECRET) {
  console.error('Error: LASTFM_API_KEY and LASTFM_SECRET are required');
  console.error('Please set these in your .env file or environment variables');
  process.exit(1);
}

// Initialize Last.fm client
const lastfm = new LastFmNode({
  api_key: LASTFM_API_KEY,
  secret: LASTFM_SECRET
});

console.log('Last.fm Session Key Generator');
console.log('============================');

// Generate authentication URL
const authUrl = `https://www.last.fm/api/auth/?api_key=${LASTFM_API_KEY}`;
console.log('\n1. Visit this URL to authorize the application:');
console.log(authUrl);
console.log('\n2. After authorizing, you will receive a token.');
console.log('3. Copy the token from the URL and run this script again with the token:');
console.log('   node get-session-key.js <your_token_here>');
console.log('\nOr if you already have a token, run:');
console.log('   node get-session-key.js <token>');

// If a token was provided as a command line argument, use it to get the session key
const token = process.argv[2];
if (token) {
  console.log('\nGetting session key with token:', token);
  
  // Get session using the token
  const session = lastfm.session({
    token: token,
    handlers: {
      success: function(sessionData) {
        console.log('\nSuccess! Here is your session information:');
        console.log('==========================================');
        console.log(`Username: ${sessionData.user}`);
        console.log(`Session Key: ${sessionData.key}`);
        console.log('\nAdd these lines to your .env file:');
        console.log(`LASTFM_USERNAME=${sessionData.user}`);
        console.log(`LASTFM_SESSION_KEY=${sessionData.key}`);
      },
      error: function(error) {
        console.error('\nError getting session:', error);
      }
    }
  });
}
