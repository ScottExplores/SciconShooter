// Outbound, read-only experiment publication. Credentials stay in ignored runtime storage.
import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const lab=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(process.argv[2]||'');
const root=path.resolve(lab,'runtime/boss-learning-v1');
if(!directory.startsWith(root+path.sep))throw Error('Provide one boss-learning session directory');
const privateConfig=JSON.parse(await readFile(path.join(lab,'runtime/broadcast/config.json'),'utf8'));
if(!/^[a-f0-9]{64}$/.test(privateConfig.token))throw Error('Publisher credential unavailable');
const endpoint='https://scicon-fly-watch.scottexplores.chatgpt.site/api/boss-publish';
const folder=path.join(directory,'broadcast');await mkdir(folder,{recursive:true});
const lockPath=path.join(folder,'publisher.lock');
try{const previous=JSON.parse(await readFile(lockPath,'utf8'));let alive=true;try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}if(alive)throw Error('A publisher already owns this session');await unlink(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}
const lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));
async function atomic(name,value){const target=path.join(folder,name),temp=target+'.tmp';await writeFile(temp,JSON.stringify(value),{flush:true});for(let attempt=0;;attempt++){try{await rename(temp,target);return;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt>=20)throw e;await new Promise(r=>setTimeout(r,Math.min(100,10*(attempt+1))));}}}
let broadcastSequence=0;try{broadcastSequence=JSON.parse(await readFile(path.join(folder,'sequence.json'),'utf8')).sequence;}catch(e){if(e.code!=='ENOENT')throw e;}
if(!Number.isSafeInteger(broadcastSequence)||broadcastSequence<0)throw Error('Invalid publisher sequence');
let stopping=false,last='',session=null,failures=0;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
try{while(!stopping){try{
 const snapshot=JSON.parse(await readFile(path.join(directory,'public/latest.json'),'utf8'));
 if(snapshot.kind!=='scicon-boss-learning-v1')throw Error('Unexpected experiment');
 if(session&&session!==snapshot.sessionId)throw Error('Session changed; publication stopped');session=snapshot.sessionId;
 const identity=`${session}:${snapshot.sequence}:${snapshot.updatedAt}:${snapshot.status}`;
 if(identity!==last){broadcastSequence++;await atomic('sequence.json',{sequence:broadcastSequence});
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${privateConfig.token}`},body:JSON.stringify({...snapshot,broadcastSequence}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Publication returned HTTP ${response.status}`);const result=await response.json();
  if(result.accepted!==true&&result.sequence!==broadcastSequence)throw Error('A newer publisher is active; publication stopped');
  last=identity;await atomic('status.json',{status:'connected',updatedAt:new Date().toISOString(),sessionId:session,sequence:broadcastSequence,decision:snapshot.sequence,experimentStatus:snapshot.status});
 }
 failures=0;
 }catch(error){failures++;await atomic('status.json',{status:'disconnected',updatedAt:new Date().toISOString(),failures,error:error.message});if(/Session changed|newer publisher/.test(error.message)){stopping=true;process.exitCode=1;}}
 if(!stopping)await new Promise(r=>setTimeout(r,failures?Math.min(15000,1000*2**Math.min(failures,4)):500));
}}finally{await lock.close();await unlink(lockPath);}
