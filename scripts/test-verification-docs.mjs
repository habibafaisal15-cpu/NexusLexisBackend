/** Test verification document upload + admin view on production */
const AUTH = 'https://nexus-lexis-backend-45v4.vercel.app';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function login(email, password) {
  const r = await fetch(`${AUTH}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await r.json()).accessToken;
}

async function run() {
  console.log('Waiting 75s for Vercel deploy...');
  await sleep(75000);

  const email = `lawyer.docs.${Date.now()}@gmail.com`;
  let r = await fetch(`${AUTH}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Doc Test Lawyer',
      email,
      password: 'Asdf1234',
      role: 'lawyer',
    }),
  });
  const reg = await r.json();
  const token = reg.accessToken;
  console.log('Registered', email);

  const form = new FormData();
  form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'cnic-front.png');
  form.append('docType', 'cnicFront');

  r = await fetch(`${AUTH}/api/auth/profile/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const upload = await r.json();
  console.log('Upload', r.status, upload.viewUrl ? 'OK' : upload);

  r = await fetch(`${AUTH}/api/auth/profile/lawyer/apply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barCouncilName: 'Punjab Bar Council',
      barCouncilNumber: `PBC-DOC-${Date.now()}`,
      city: 'Lahore',
      shortBio: 'Test',
      fullBio: 'Test lawyer application with documents',
      officeAddress: 'Lahore',
      onlineFee: 5000,
      inPersonFee: 8000,
      cnicFront: upload.documentRef,
      profilePhoto: upload.documentRef,
    }),
  });
  console.log('Apply', r.status, (await r.json()).profile?.lawyerProfile?.verificationStatus || 'applied');

  const adminToken = await login('admin@nexuslexis.law', 'admin123');
  const me = await fetch(`${AUTH}/api/auth/me`, { headers: { Authorization: `Bearer ${adminToken}` } }).then((x) => x.json());
  const apps = await fetch(`${AUTH}/api/auth/admin/applications`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }).then((x) => x.json());
  const app = apps.applications?.find((a) => a.email === email);
  const detail = await fetch(`${AUTH}/api/auth/admin/applications/${app.userId}?type=lawyer`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }).then((x) => x.json());
  const cnicDoc = detail.application?.documents?.cnicFront;
  console.log('Admin doc meta', cnicDoc);

  const view = await fetch(cnicDoc.viewUrl, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('Admin view doc', view.status, view.headers.get('content-type'), (await view.arrayBuffer()).byteLength, 'bytes');
}

run().catch(console.error);
