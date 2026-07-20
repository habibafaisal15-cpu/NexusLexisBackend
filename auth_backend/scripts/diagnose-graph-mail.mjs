/**
 * Diagnose Microsoft Graph mail setup (read-only unless --send <email>).
 * Usage:
 *   node scripts/diagnose-graph-mail.mjs
 *   node scripts/diagnose-graph-mail.mjs --send you@example.com
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const tenant = process.env.MS365_TENANT_ID;
const clientId = process.env.MS365_CLIENT_ID;
const secret = process.env.MS365_CLIENT_SECRET;
const sender = process.env.MS365_SENDER || process.env.SMTP_USER;
const sendFlag = process.argv.indexOf('--send');
const sendTo = sendFlag >= 0 ? process.argv[sendFlag + 1] : null;

console.log('Microsoft Graph mail diagnosis\n');
console.log('Tenant ID :', tenant || '(missing)');
console.log('Client ID :', clientId || '(missing)');
console.log('Sender    :', sender || '(missing)');
console.log('');

if (!tenant || !clientId || !secret || !sender) {
  console.error('Missing MS365_* values in auth_backend/.env');
  process.exit(1);
}

const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  }),
});

const tokenData = await tokenRes.json();
console.log('1. Token request:', tokenRes.status, tokenRes.ok ? 'OK' : 'FAILED');
if (!tokenData.access_token) {
  console.error(tokenData.error_description || tokenData.error || tokenData);
  process.exit(1);
}

const userRes = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}`, {
  headers: { Authorization: `Bearer ${tokenData.access_token}` },
});
console.log('2. Sender mailbox lookup:', userRes.status, userRes.statusText);
if (userRes.ok) {
  const user = await userRes.json();
  console.log('   Display name:', user.displayName);
  console.log('   UPN         :', user.userPrincipalName);
  console.log('   Mail enabled:', user.mail ?? user.userPrincipalName);
} else {
  const detail = await userRes.text();
  console.log('   Detail:', detail.slice(0, 300));
  console.log('\n   >> Sender may not exist in this Azure tenant, or app lacks User.Read.All.');
  console.log('   >> Mail can still queue, but delivery often fails if the mailbox is wrong.');
}

if (sendTo) {
  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: 'Nexus Lexis — delivery test',
          body: {
            contentType: 'HTML',
            content: '<p>If you received this, Graph external delivery is working.</p>',
          },
          from: { emailAddress: { name: 'Nexus Lexis', address: sender } },
          toRecipients: [{ emailAddress: { address: sendTo } }],
        },
        saveToSentItems: true,
      }),
    }
  );
  console.log('\n3. Test send to', sendTo + ':', sendRes.status, sendRes.statusText);
  const body = await sendRes.text();
  if (body) console.log('   Response:', body.slice(0, 300));
  if (sendRes.status === 202 || sendRes.ok) {
    console.log('   Graph accepted the message. Check recipient inbox + spam.');
    console.log('   Also check Sent Items in', sender, 'and Exchange message trace.');
  }
}

console.log('\nIf external Gmail still receives nothing:');
console.log('- Exchange admin → Message trace → search recipient');
console.log('- Confirm', sender, 'exists in the SAME tenant as the Azure app');
console.log('- Check Sent Items on', sender);
console.log('- Gmail: search from:nexuslexis.law in Spam/All Mail');
