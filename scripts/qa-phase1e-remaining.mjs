import { chromium } from 'playwright';
const BASE='http://localhost:4191';
const out=[];
const log=(k,v)=>{out.push([k,v]);console.log(`${k}: ${v}`)};
const api=async (p,i)=>{const r=await fetch(BASE+p,i);const t=await r.text();let j;try{j=JSON.parse(t)}catch{};return {r,j,t};};

// ensure state has baseline with explicit override
const fixture=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../data/qa-reset-state.json', import.meta.url),'utf8'));
fixture.__writeControl={overrideDowngrade:true,source:'qa_script',explicitLiveOverride:true};
await api('/api/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fixture)});

const b=await chromium.launch({headless:true});
const c=await b.newContext();
const p1=await c.newPage();
const p2=await c.newPage();
for(const p of [p1,p2]) p.on('dialog',d=>d.accept());
await p1.goto(BASE,{waitUntil:'domcontentloaded'});
await p2.goto(BASE,{waitUntil:'domcontentloaded'});
await p1.click('#addProjectBtn');
await p1.fill('#projectForm input[name="name"]','QA Project');
await p1.fill('#projectForm input[name="summary"]','sum');
await p1.click('#projectForm button.btn.primary');
await p1.click('#addTaskBtn');
await p1.fill('#taskForm input[name="title"]','QA Task');
await p1.fill('#taskForm input[name="nextAction"]','next');
await p1.click('#taskForm button.btn.primary');
await p1.click('#addNoteBtn');
await p1.locator('#notesBoardToday .note-card').first().locator('input[data-field="title"]').fill('Note pre-restore');

await p1.click('#openSettingsBtn');
await p1.$eval('#refreshBackupsBtn',e=>e.click());
await p1.waitForTimeout(800);
const pre=(await api('/api/state/backups')).j.backups;
const latest=pre?.[0]?.backupFile;
log('latest_backup',latest||'none');

await p1.click('#closeSettingsBtn');
const revBefore=(await api('/api/state')).j.__integrity?.revision;
await p1.click('#addNoteBtn');
await p1.locator('#notesBoardToday .note-card').first().locator('input[data-field="title"]').fill('Temp Marker');
await p1.click('#openSettingsBtn');
await p1.$eval('#refreshBackupsBtn',e=>e.click());
await p1.waitForTimeout(600);
await p1.$eval(`[data-state-restore="${latest}"]`,e=>e.click());
await p1.waitForTimeout(1200);
const markerCount=await p1.locator('#notesBoardToday .note-card input[data-field="title"][value="Temp Marker"]').count();
log('restore_marker_count',String(markerCount));

const post=(await api('/api/state/backups')).j.backups;
log('pre_restore_exists',String(post.some(b=>b?.snapshotMeta?.reason==='pre_restore')));
const revAfter=(await api('/api/state')).j.__integrity?.revision;
log('revision_before_after',`${revBefore}->${revAfter}`);

const st=(await api('/api/state')).j;
log('state_integrity',JSON.stringify(st.__integrity||{}));
log('backup_meta_sample',JSON.stringify(post?.[0]?.snapshotMeta||{}));

const proj=await p1.locator('#projectDirectory .project-card',{hasText:'QA Project'}).count();
const task=await p1.locator('.task strong',{hasText:'QA Task'}).count();
const note=await p1.locator('#notesBoardToday .note-card input[data-field="title"][value="Note pre-restore"]').count();
log('regression_counts',`project=${proj} task=${task} note=${note}`);

await b.close();