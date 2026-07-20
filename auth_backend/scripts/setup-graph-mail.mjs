/**
 * One-time setup: sign in as contact@nexuslexis.law and get MS365_REFRESH_TOKEN.
 * Usage: node scripts/setup-graph-mail.mjs
 */
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const tenant = process.env.MS365_TENANT_ID;
const clientId = process.env.MS365_CLIENT_ID;
const clientSecret = process.env.MS365_CLIENT_SECRET;

if (!tenant || !clientId || !clientSecret) {
  console.error('Set MS365_TENANT_ID, MS365_CLIENT_ID, MS365_CLIENT_SECRET in auth_backend/.env first.');
  process.exit(1);
}

console.log('\nNexus Lexis — Microsoft Graph mail setup (one-time)\n');
console.log('Before running this, add to your Azure app:');
console.log('  API permissions → Microsoft Graph → DELEGATED → Mail.Send');
console.log('  Grant admin consent if prompted.\n');

const deviceRes = await fetch(
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'https://graph.microsoft.com/Mail.Send offline_access',
    }),
  }
);

const device = await deviceRes.json();
if (!device.device_code) {
  console.error('Device code request failed:', device);
  process.exit(1);
}

console.log(device.message);
console.log('\nWaiting for you to sign in as contact@nexuslexis.law ...\n');

const started = Date.now();
let tokenData = null;

while (Date.now() - started < (device.expires_in || 900) * 1000) {
  await new Promise((r) => setTimeout(r, device.interval ? device.interval * 1000 : 5000));

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    }
  );

  tokenData = await tokenRes.json();
  if (tokenData.access_token) break;
  if (tokenData.error !== 'authorization_pending' && tokenData.error !== 'slow_down') {
    console.error('Sign-in failed:', tokenData.error_description || tokenData.error);
    process.exit(1);
  }
}

if (!tokenData?.refresh_token) {
  console.error('No refresh token returned. Ensure offline_access scope is allowed.');
  process.exit(1);
}

console.log('\nSuccess! Add this line to auth_backend/.env:\n');
console.log(`MS365_REFRESH_TOKEN=${tokenData.refresh_token}`);
console.log('\nAnd set:');
console.log('EMAIL_PROVIDER=graph-delegated,graph');
console.log('\nThen restart auth backend and run: npm run test:email\n');

const rl = readline.createInterface({ input, output });
await rl.question('Press Enter to exit...');
rl.close();
