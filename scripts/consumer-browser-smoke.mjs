// Local browser smoke check: no authentication, passkeys or payments are performed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const output = resolve('build/consumer-browser'); mkdirSync(output, { recursive:true });
const executable = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!executable) throw new Error('Chrome is required for the browser smoke check.');
const server = spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory',resolve('apps/mobile/dist')], {stdio:['ignore','ignore','pipe']});
let serverLog=''; server.stderr.on('data',chunk=>{serverLog+=chunk;});
const browser = spawn(executable,['--headless','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port=9229',`--user-data-dir=${mkdtempSync(join(tmpdir(),'cherry-browser-'))}`,'about:blank'],{stdio:'ignore'});
let socket; let sequence=0; const pending=new Map(); const exceptions=[]; let command,evaluate,screenshot;
try {
 let pages;
 for(let i=0;i<100;i++){try{pages=await (await fetch('http://127.0.0.1:9229/json')).json();if(pages.some(p=>p.type==='page')&&(await fetch('http://127.0.0.1:8765/')).ok)break;}catch{}await sleep(100);}
 const page=pages?.find(p=>p.type==='page');assert.ok(page?.webSocketDebuggerUrl,'Chrome did not start');
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const handler=pending.get(m.id);pending.delete(m.id);if(handler){clearTimeout(handler.timer);m.error?handler.reject(new Error(JSON.stringify(m.error))):handler.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);});
 command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
 evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 const click=async label=>assert.equal(await evaluate(`(()=>{const b=[...document.querySelectorAll('[role="button"],button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!b||b.getAttribute('aria-disabled')==='true')return false;b.click();return true;})()`),true,`Button not available: ${label}`);
 const text=()=>evaluate('document.body?.innerText ?? ""');
 const disabled=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('[role="button"],button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});return Boolean(b&&(b.getAttribute('aria-disabled')==='true'||b.disabled));})()`);
 screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(output,name),Buffer.from(shot.data,'base64'));};
 await command('Runtime.enable');await command('Page.enable');
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 const navigation=await command('Page.navigate',{url:'http://127.0.0.1:8765/'});assert.equal(navigation.errorText,undefined);
 let body='';for(let i=0;i<150;i++){body=await text();if(body.includes('Supplier payments'))break;await sleep(100);}
 assert.match(body,/Passkey-powered business payments/);
 await click('Earnings · Rewards · Gifts');await sleep(100);
 assert.match(await text(),/Earn, give and get rewarded/);
 assert.match(await text(),/On-chain actions are disabled/);
 assert.equal(await disabled('1. Approve exact test AUSD amount'),true);
 await click('Restart 60-second preview');await sleep(2100);
 body=await text();assert.match(body,/Illustrative preview/);assert.match(body,/This counter is a simulation/);
 await screenshot('earnings-desktop.png');
 await click('Gifts');await sleep(100);await click('Set demo unlock in 2 minutes');
 assert.match(await text(),/Only the recipient can claim before expiry/);
 assert.equal(await disabled('2. Fund the locked plan'),true);
 await screenshot('gifts-desktop.png');
 await click('Rewards');await sleep(100);
 assert.match(await text(),/Raw CRE simulation JSON cannot authorise a reward/);
 assert.equal(await disabled('Claim test reward with passkey'),true);
 await screenshot('rewards-desktop.png');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await click('Gifts');await sleep(200);
 assert.ok(await evaluate('document.documentElement.scrollWidth <= 391'),'Mobile layout overflows horizontally');
 await screenshot('gifts-mobile.png');
 await click('Supplier payments');await sleep(100);assert.match(await text(),/Passkey-powered business payments/);
 assert.equal(exceptions.length,0,JSON.stringify(exceptions));
 writeFileSync(join(output,'result.json'),JSON.stringify({passed:true,checks:['original supplier flow retained','consumer tabs render','default-off write controls','explicit simulated earnings preview','gift timing fields','unsigned CRE warning','mobile 390px width','no uncaught JavaScript exceptions'],paymentsExecuted:0},null,2));
 console.log('CONSUMER_BROWSER_SMOKE: PASS (desktop + mobile, no payments)');
} catch(error) {
 console.error('BROWSER_EXCEPTIONS',JSON.stringify(exceptions));
 writeFileSync(join(output,'exceptions.json'),JSON.stringify(exceptions,null,2));
 writeFileSync(join(output,'server.log'),serverLog);
 if(evaluate)writeFileSync(join(output,'failure.html'),await evaluate('document.documentElement.outerHTML').catch(()=>''));
 if(screenshot)await screenshot('failure.png').catch(()=>{});
 throw error;
} finally { socket?.close();browser.kill('SIGTERM');server.kill('SIGTERM'); }
