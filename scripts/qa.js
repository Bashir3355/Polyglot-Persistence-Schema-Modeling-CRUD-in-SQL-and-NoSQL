// Automated QA: run with the server up ->  npm run qa
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const call = async (m, p, b) => {
  const r = await fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null };
};
const ok = (cond, label, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label} ${cond ? '' : extra}`); };

async function suite(engine, orphanId) {
  const A = `/api/${engine}`; console.log(`\n=== ${engine.toUpperCase()} ===`);
  let r = await call('POST', `${A}/projects`, { name: 'QA Project', description: 'created by qa.js' });
  ok(r.status === 201, 'Create project -> 201', r.status); const pid = r.data.id;
  r = await call('POST', `${A}/projects/${pid}/tasks`, { title: 'Write tests' });
  ok(r.status === 201 && r.data.status === 'todo', 'Create child task -> 201 (default status todo)'); const tid = r.data.id;
  r = await call('GET', `${A}/projects/${pid}`);
  ok(r.status === 200 && r.data.tasks.length === 1, 'Read project returns embedded/joined tasks in ONE call');
  r = await call('PATCH', `${A}/projects/${pid}`, { name: 'QA Project v2' });
  ok(r.status === 200 && r.data.name === 'QA Project v2', 'Update project name reflected');
  r = await call('PATCH', `${A}/projects/${pid}/tasks/${tid}`, { status: 'done' });
  ok(r.status === 200, 'Update task status -> 200');
  r = await call('GET', `${A}/projects/${pid}`);
  ok(r.data.tasks[0].status === 'done', 'Subsequent read shows updated task status');
  r = await call('GET', `${A}/projects`); ok(r.status === 200 && r.data.some((p) => p.id === pid), 'List includes project');
  r = await call('POST', `${A}/projects`, { name: '' }); ok(r.status === 400, 'Empty name -> 400');
  r = await call('POST', `${A}/projects`, { name: 'x'.repeat(500) }); ok(r.status === 400, 'Over-long name -> 400');
  r = await call('PATCH', `${A}/projects/${pid}/tasks/${tid}`, { status: 'bogus' }); ok(r.status === 400, 'Invalid status -> 400');
  r = await call('GET', `${A}/projects/not-an-id`); ok(r.status === 400, 'Malformed id -> 400');
  r = await call('DELETE', `${A}/projects/${pid}/tasks/${tid}`); ok(r.status === 204, 'Delete task -> 204');
  r = await call('POST', `${A}/projects/${pid}/tasks`, { title: 'to be cascaded' });
  r = await call('DELETE', `${A}/projects/${pid}`); ok(r.status === 204, 'Delete project -> 204');
  r = await call('GET', `${A}/projects/${pid}`); ok(r.status === 404, 'Deleted project -> 404');
  r = await call('POST', `${A}/projects/${orphanId}/tasks`, { title: 'orphan' });
  if (engine === 'sql') ok(r.status === 409, 'NEGATIVE: orphan task rejected by FK -> 409', r.status);
  else ok(r.status === 404, 'Unknown parent -> 404 (no FK in document DB; app-level check)', r.status);
}

(async () => {
  try {
    await suite('sql', '00000000-0000-4000-8000-000000000000');
    await suite('mongo', '64b7f0000000000000000000');
  } catch (e) { console.error('Is the server running?', e.message); process.exit(2); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
