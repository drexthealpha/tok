// Deploy Tok's server on Render at an exact commit, then wait until live.
// Usage: RENDER_API_KEY=... node scripts/deploy-server.mjs <commit sha>
const SERVICE = process.env.RENDER_SERVICE ?? 'srv-dc4rqk6i0phs73bcp510';
const sha = process.argv[2];
if (!sha) throw new Error('give the commit sha');
const h = { authorization: `Bearer ${process.env.RENDER_API_KEY}`, 'content-type': 'application/json', accept: 'application/json' };
const r = await fetch(`https://api.render.com/v1/services/${SERVICE}/deploys`, { method: 'POST', headers: h, body: JSON.stringify({ commitId: sha }) });
const d = await r.json();
console.log('deploy', d.id, d.status);
for (let i = 0; i < 60; i++) {
  await new Promise((s) => setTimeout(s, 15000));
  const s = await (await fetch(`https://api.render.com/v1/services/${SERVICE}/deploys/${d.id}`, { headers: h })).json();
  if (['live', 'build_failed', 'update_failed', 'canceled', 'deactivated'].includes(s.status)) {
    console.log('status', s.status, s.commit?.id?.slice(0, 7));
    process.exit(s.status === 'live' ? 0 : 1);
  }
}
console.log('timed out');
process.exit(1);
