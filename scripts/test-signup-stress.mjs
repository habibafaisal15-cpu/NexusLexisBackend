/**
 * Signup stress test — same display name, concurrent registrations.
 * Usage: node scripts/test-signup-stress.mjs
 */

const AUTH = 'https://nexus-lexis-backend-45v4.vercel.app';

async function register({ fullName, email, role }) {
  const res = await fetch(`${AUTH}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      email,
      password: 'StressTest1234',
      role,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data, error: data?.error };
}

async function registerMany(label, role, count) {
  const stamp = Date.now();
  const fullName = 'Duplicate Name Test';
  const tasks = Array.from({ length: count }, (_, i) =>
    register({
      fullName,
      email: `${role}.stress.${stamp}.${i}@gmail.com`,
      role,
    })
  );
  const results = await Promise.all(tasks);
  const passed = results.filter((r) => r.ok && r.data?.accessToken);
  const failed = results.filter((r) => !r.ok);
  const rawDbErrors = failed.filter((r) =>
    String(r.error || '').includes('duplicate key') ||
    String(r.error || '').includes('users_username_key')
  );

  console.log(`\n${label} (${count} parallel, same display name "${fullName}")`);
  console.log(`  PASS: ${passed.length}/${count}`);
  if (failed.length) {
    for (const f of failed) {
      console.log(`  FAIL ${f.status}: ${f.error || JSON.stringify(f.data).slice(0, 120)}`);
    }
  }
  if (rawDbErrors.length) {
    console.log('  *** RAW DB ERROR LEAKED TO FRONTEND ***');
  }

  return {
    label,
    total: count,
    passed: passed.length,
    failed: failed.length,
    rawDbErrors: rawDbErrors.length,
  };
}

async function runSequentialSameName(role) {
  const stamp = Date.now();
  const fullName = 'John Smith';
  console.log(`\nSequential ${role} signups with name "${fullName}"`);
  for (let i = 0; i < 5; i += 1) {
    const r = await register({
      fullName,
      email: `${role}.seq.${stamp}.${i}@gmail.com`,
      role,
    });
    const icon = r.ok ? 'PASS' : 'FAIL';
    console.log(`  ${icon} #${i + 1}: ${r.ok ? r.data?.user?.role : r.error}`);
    if (!r.ok) return false;
  }
  return true;
}

async function run() {
  console.log('\n=== SIGNUP STRESS TEST (PRODUCTION) ===\n');

  const summary = [];
  summary.push(await registerMany('Lawyer parallel', 'lawyer', 5));
  summary.push(await registerMany('CA parallel', 'ca', 5));
  summary.push(await registerMany('Client parallel', 'client', 5));

  const seqLawyer = await runSequentialSameName('lawyer');
  const seqCa = await runSequentialSameName('ca');

  const totalFailed = summary.reduce((n, s) => n + s.failed, 0);
  const rawLeaks = summary.reduce((n, s) => n + s.rawDbErrors, 0);

  console.log('\n=== SUMMARY ===');
  console.log(`Parallel failures: ${totalFailed}`);
  console.log(`Raw DB errors exposed: ${rawLeaks}`);
  console.log(`Sequential lawyer: ${seqLawyer ? 'PASS' : 'FAIL'}`);
  console.log(`Sequential CA: ${seqCa ? 'PASS' : 'FAIL'}`);

  const ok = totalFailed === 0 && rawLeaks === 0 && seqLawyer && seqCa;
  console.log(ok ? '\nALL SIGNUP STRESS TESTS PASSED\n' : '\nSIGNUP STRESS TESTS FAILED\n');
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
