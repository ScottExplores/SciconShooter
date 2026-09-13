// Outbound display-only publisher. No inbound tunnel or public coordinator control.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const lab=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(lab,'runtime/broadcast');await mkdir(folder,{recursive:true});
const config=JSON.parse(await readFile(path.join(folder,'config.json'),'utf8'));
if(config.endpoint!=='https://scicon-fly-watch.scottexplores.chatgpt.site/api/publish'||!/^\w[\w-]{0,99}$/.test(config.sessionId)||!/^[a-f0-9]{64}$/.test(config.token))throw new Error('Invalid private broadcast configuration');
async function atomic(name,value){const target=path.join(folder,name),temp=target+'.tmp';await writeFile(temp,JSON.stringify(value));await rename(temp,target);}
let sequence=0;try{sequence=JSON.parse(await readFile(path.join(folder,'sequence.json'),'utf8')).sequence;}catch(e){if(e.code!=='ENOENT')throw e;}
if(!Number.isSafeInteger(sequence)||sequence<0)throw new Error('Corrupt broadcast sequence');
let stopping=false,lastPublished='',failures=0;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function get(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);return response.json();}
console.log('Read-only live publisher started.');
while(!stopping){
  try{
    const snapshot=await get('http://127.0.0.1:8766/continuous/live');
    if(snapshot.sessionId!==config.sessionId)throw new Error('Local session changed; publication withheld');
    const identity=`${snapshot.sessionId}:${snapshot.sequence}:${snapshot.updatedAt}:${snapshot.status}`;
    if(identity!==lastPublished){
      // Reserve sequence durably before sending. Retries may skip numbers, never reuse them.
      sequence++;await atomic('sequence.json',{sequence});
      const result=await get(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.token}`},body:JSON.stringify({...snapshot,broadcastSequence:sequence})});
      if(result.accepted!==true&&result.sequence!==sequence)throw new Error('Cloud feed has a newer sequence; publisher stopped');
      lastPublished=identity;
      await atomic('status.json',{status:'connected',updatedAt:new Date().toISOString(),sessionId:snapshot.sessionId,sequence,decision:snapshot.sequence,experimentStatus:snapshot.status});
    }
    failures=0;
  }catch(error){failures++;await atomic('status.json',{status:'disconnected',updatedAt:new Date().toISOString(),sequence,failures,error:error.message});if(/newer sequence|session changed/.test(error.message)){stopping=true;process.exitCode=1;}}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,failures?Math.min(15000,1000*2**Math.min(failures,4)):500));
}
