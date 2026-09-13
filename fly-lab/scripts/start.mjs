import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=process.env.SCICON_FLY_PYTHON || path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!existsSync(python)) throw new Error('Run the setup command in fly-lab/README.md first; the lab uses an isolated Python environment.');
// Never inherit game/API/provider credentials into either child process.
const env={};
for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOME','LANG','NODE_EXTRA_CA_CERTS']) if(process.env[key]) env[key]=process.env[key];
env.PYTHONPATH=path.join(root,'python'); env.PYTHONUNBUFFERED='1';
const web=spawn(process.execPath,['--use-system-ca',path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5180','--strictPort'],{cwd:root,env,stdio:'inherit',windowsHide:true});
const api=spawn(python,['-m','scicon_fly.server'],{cwd:root,env,stdio:'inherit',windowsHide:true});
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;web.kill();api.kill();setTimeout(()=>process.exit(code),500).unref();}
for(const child of [web,api]) {child.on('error',e=>{console.error(e.message);stop(1)});child.on('exit',code=>stop(code??1));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
console.log('Scicon Fly Lab: http://127.0.0.1:5180 (private, production APIs excluded)');
