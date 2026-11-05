// Admin flows in a real browser (Firebase stubbed): Poster Manager add/apply/delete, Abyss.to source validation, default-inactive, activate toggle, modals fit 320/390/1280.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node tests/e2e/admin-flows.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const require = createRequire(process.env.PW_REQUIRE_FROM || import.meta.url);
const { chromium } = require('playwright');
const stub = readFileSync(new URL('./firebase-stub.js', import.meta.url),'utf8');
const INDEXES = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url),'utf8'));
const T=(s)=>({seconds:s,toDate:()=>new Date(s*1000)}); const now=Math.floor(Date.now()/1000);
const an=(id,t,v)=>({title:t,alternativeTitles:[],slug:id,description:'',posterUrl:'',coverUrl:'',bannerUrl:'',genres:[],releaseYear:2020,status:'ongoing',animeType:'TV',rating:8,featured:false,visibility:v,createdAt:T(now),updatedAt:T(now),titleLower:t.toLowerCase(),searchTokens:[]});
const DATA={'posters/p1':{title:'Old',animeId:'naruto',imageUrl:'https://img.example/o.jpg',type:'poster',altText:'',isPublished:true,displayOrder:0,createdAt:T(now),updatedAt:T(now),createdBy:'a'},'anime/naruto':an('naruto','Naruto','public'),'userRoles/admin1':{uid:'admin1',role:'super_admin'},
'seasons/naruto_s1':{animeId:'naruto',seasonNumber:1,title:'S1',description:'',releaseYear:2020,sortOrder:1,isPublished:true,animePublic:true},
'episodes/naruto_s1e1':{animeId:'naruto',animeTitle:'Naruto',seasonId:'naruto_s1',episodeNumber:1,title:'One',description:'',thumbnailUrl:'',durationSeconds:1,releaseAt:T(now),isPublished:true,animePublic:true,createdAt:T(now),updatedAt:T(now)}};
const s=spawn('node',[new URL('../../scripts/dev-server.mjs', import.meta.url).pathname,'5059'],{stdio:'ignore'}); await new Promise(r=>setTimeout(r,700));
const b=await chromium.launch(); let bad=[];
for (const w of [320,390,1280]) {
 const c=await b.newContext({viewport:{width:w,height:700},isMobile:w<700,hasTouch:w<700});
 await c.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',body:`export * from '/__stub/fb.js';`}));
 await c.route('**/__stub/fb.js',r=>r.fulfill({contentType:'text/javascript',body:stub})); await c.route(/fonts\.|example\.com/,r=>r.abort());
 const p=await c.newPage(); p.on('console',m=>void 0); p.on('pageerror',e=>{ if(!/localStorage/.test(e.message)) bad.push(w+' pageerror '+e.message); }); // localStorage errors come from the un-routed external player iframe (no network in CI) p.on('dialog',d=>d.accept('naruto'));
 await p.addInitScript(([d,i])=>{window.__DATA__=d;window.__INDEXES__=i;localStorage.setItem('stub-user','admin')},[DATA,INDEXES]);
 const fit=async(tag)=>{const m=await p.evaluate(()=>{const d=document.querySelector('dialog[open]');if(!d)return null;const r=d.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,iw:innerWidth,ih:innerHeight,sw:document.documentElement.scrollWidth}}); if(!m||m.l<0||m.r>m.iw+1||m.b>m.ih+1||m.sw>m.iw) bad.push(`${w} ${tag} modal ${JSON.stringify(m)}`)};
 // Poster manager: add poster
 await p.goto('http://localhost:5059/admin/posters'); await p.waitForSelector('.poster-card');
 await p.click('#p-new'); await p.waitForSelector('#pf'); await p.waitForTimeout(300); await fit('poster-form');
 await p.fill('#pf-title','New art'); await p.fill('#pf-url','https://img.example/x.jpg'); await p.selectOption('#scope-anime','naruto'); await p.waitForTimeout(100);
 const applyVisible=await p.evaluate(()=>!document.querySelector('#pf-apply-wrap').hidden); if(!applyVisible) bad.push(w+' apply checkbox hidden');
 await p.check('#pf-apply'); await p.click('#pf [type=submit]'); await p.waitForTimeout(600);
 const st=await p.evaluate(()=>({w:window.__WRITES__,poster:window.__DATA__['anime/naruto'].posterUrl}));
 if(!st.w?.some(x=>x[0]==='add'&&x[1].startsWith('posters/'))||st.poster!=='https://img.example/x.jpg') bad.push(w+' poster save/apply failed '+JSON.stringify(st));
 // bad URL
 await p.click('#p-new'); await p.waitForSelector('#pf'); await p.fill('#pf-title','x'); await p.fill('#pf-url','javascript:alert(1)'); await p.click('#pf [type=submit]'); await p.waitForTimeout(200);
 const e1=await p.evaluate(()=>document.querySelector('#pf [data-error]').textContent); if(!/https/.test(e1)) bad.push(w+' bad poster url not rejected: '+e1);
 await p.keyboard.press('Escape');
 // delete confirm
 await p.click('.poster-card [data-act=del]'); await p.waitForSelector('dialog[open]'); await fit('confirm'); await p.click('dialog [data-ok]'); await p.waitForTimeout(500);
 if (await p.evaluate(()=>Object.keys(window.__DATA__).filter(k=>k.startsWith('posters/')).length)>1) {} 
 // Video sources: add abyss source
 await p.goto('http://localhost:5059/admin/video'); await p.waitForSelector('#scope-anime option:nth-child(2)',{state:'attached'}); await p.selectOption('#scope-anime','naruto'); await p.waitForSelector('#scope-ep'); await p.selectOption('#scope-ep','naruto_s1e1'); await p.waitForSelector('#crud-new');
 await p.click('#crud-new'); await p.waitForSelector('dialog[open] form'); await p.waitForTimeout(300); await fit('source-form');
 const defActive=await p.evaluate(()=>document.querySelector('[name=isActive]').checked); if(defActive) bad.push(w+' isActive defaults to true');
 await p.fill('[name=sourceName]','Abyss 1080'); await p.fill('[name=embedUrl]','https://dash.abyss.to/'); await p.click('dialog [type=submit]'); await p.waitForTimeout(300);
 const e2=await p.evaluate(()=>document.querySelector('dialog [data-error]').textContent); if(!/dashboard/i.test(e2)) bad.push(w+' dashboard URL accepted: '+e2);
 await p.fill('[name=embedUrl]','<iframe src="https://abysscdn.com/?v=K8R6OOjS7" allowfullscreen></iframe>'); await p.click('#preview-btn'); await p.waitForTimeout(200);
 const pv=await p.evaluate(()=>document.querySelector('#preview-player iframe')?.src); if(pv!=='https://abysscdn.com/?v=K8R6OOjS7') bad.push(w+' preview failed '+pv);
 await p.click('dialog [type=submit]'); await p.waitForTimeout(600);
 const saved=await p.evaluate(()=>Object.entries(window.__DATA__).filter(([k])=>k.startsWith('episodeSources/')).map(([,v])=>v));
 if(saved.length!==1||saved[0].provider!=='abyss'||saved[0].isActive!==false||saved[0].embedUrl!=='https://abysscdn.com/?v=K8R6OOjS7') bad.push(w+' source save wrong '+JSON.stringify(saved));
 // activate toggle
 await p.click('[data-act="0"]'); await p.waitForTimeout(500);
 const act=await p.evaluate(()=>Object.values(window.__DATA__).find(v=>v.sourceName==='Abyss 1080')?.isActive); if(act!==true) bad.push(w+' activate failed');
 const so=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); if(so>0) bad.push(w+' video page overflow '+so);
 if (w===320) await p.screenshot({path:new URL('./screenshots/320-video-sources-table.png', import.meta.url).pathname});
 await c.close();
}
await b.close(); s.kill(); console.log(bad.length?bad.join('\n'):'admin interaction tests OK');
