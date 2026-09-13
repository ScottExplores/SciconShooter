import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const lab=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw new Error('Usage: node scripts/export-live.mjs NEW_OUTPUT_DIRECTORY');
const destination=path.resolve(process.argv[2]);
try{await stat(destination);throw new Error('Choose a new directory; existing output is preserved.');}catch(e){if(e.code!=='ENOENT')throw e;}
const manifest=JSON.parse(await readFile(path.join(lab,'dist/.vite/manifest.json'),'utf8')),files=new Set(),visited=new Set();
function include(key){if(visited.has(key))return;visited.add(key);const chunk=manifest[key];if(!chunk)throw new Error('Missing built entry '+key);for(const name of [chunk.file,...(chunk.css||[]),...(chunk.assets||[])]){if(name.includes('..')||path.isAbsolute(name))throw new Error('Unsafe build path');files.add(name);}for(const child of [...(chunk.imports||[]),...(chunk.dynamicImports||[])])include(child);}
include('live.html');await mkdir(destination,{recursive:true});
for(const name of files){const target=path.join(destination,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await readFile(path.join(lab,'dist',name)));}
await writeFile(path.join(destination,'index.html'),await readFile(path.join(lab,'dist/live.html')));
console.log(JSON.stringify({directory:destination,files:files.size+1,entry:'live.html',kind:'read-only-live-viewer'}));
