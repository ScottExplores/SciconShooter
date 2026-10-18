import {readFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {UI_DEVICES,UI_SCREEN_NAMES,writeReport} from './ui-audit.mjs';

/** Combine sequential batches without turning missing/failed coverage into a pass. */
export async function combineUiReports(reportPaths,{output='/workspace/scicon-revamp/qa',runId}={}){
  if(!runId || !/^[a-zA-Z0-9._-]+$/.test(runId))throw new Error('A safe output run id is required');
  const artifactDir=path.join(output,runId);await mkdir(artifactDir,{recursive:false});
  const cases=new Map(), provenance=[], browserErrors=[],network=[];
  for(const reportPath of reportPaths){
    const source=JSON.parse(await readFile(reportPath,'utf8'));
    provenance.push({runId:source.runId,dist:source.dist,reportPath:path.resolve(reportPath),startedAt:source.startedAt,finishedAt:source.finishedAt||'interrupted after captured cases'});
    for(const result of source.results){
      if(result.status==='running')continue;
      cases.set(`${result.device}:${result.screen}`,{...result,build:result.build||source.dist||'unrecorded legacy build',sourceRunId:source.runId,sourceReport:path.resolve(reportPath),sourceArtifactDir:source.artifactDir});
    }
    browserErrors.push(...source.browserErrors);network.push(...source.network);
  }
  for(const device of Object.keys(UI_DEVICES))for(const screen of [...UI_SCREEN_NAMES,...(device==='desktop'?['desktop-shell','desktop-playing-shell']:[])]){
    if(!cases.has(`${device}:${screen}`))browserErrors.push({device,error:`Required screen was not captured: ${screen}`});
  }
  const results=[...cases.values()];
  for(const result of results){
    const directory=path.join(artifactDir,result.device);await mkdir(directory,{recursive:true});
    for(const screenshot of result.screenshots)await copyFile(path.join(result.sourceArtifactDir,result.device,screenshot),path.join(directory,screenshot));
  }
  const report={runId,artifactDir,startedAt:provenance[0]?.startedAt,finishedAt:new Date().toISOString(),devices:Object.keys(UI_DEVICES),partial:false,results,browserErrors,network,provenance};
  await writeReport(report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [runId,...reports]=process.argv.slice(2);
  const report=await combineUiReports(reports,{runId});
  console.log(`${report.status.toUpperCase()}: ${report.results.length} cases, ${report.overflowCount} overflows, ${report.browserErrors.length} coverage/browser errors; ${report.artifactDir}/report.md`);
  process.exitCode=report.status==='passed'?0:1;
}
