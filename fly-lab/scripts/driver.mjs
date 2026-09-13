import { chromium } from 'playwright';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export class EngineDriver {
  constructor(origin = 'http://127.0.0.1:5180', {renderProfile = 'swiftshader'} = {}) {
    if (!['swiftshader', 'local-d3d11'].includes(renderProfile)) throw new Error('Unknown render profile; choose swiftshader or local-d3d11');
    this.origin = origin; this.renderProfile = renderProfile; this.last = null; this.violations = []; this.assets={};this.assetRequests=[];
  }
  async open() {
    if (this.browser) return;
    const profileArgs = this.renderProfile === 'local-d3d11'
      ? ['--use-angle=d3d11', '--enable-gpu']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
    this.browser = await chromium.launch({ headless: true, args: [...profileArgs, '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'
    ] });
    this.context = await this.browser.newContext({ viewport: {width:390,height:844}, deviceScaleFactor:1,
      reducedMotion:'no-preference', serviceWorkers:'block', locale:'en-US', timezoneId:'UTC' });
    await this.context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== this.origin) {
        this.violations.push(url.origin + url.pathname); await route.abort('blockedbyclient'); return;
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/lab-api')) {
        this.violations.push(url.pathname); await route.abort('blockedbyclient'); return;
      }
      await route.continue();
    });
    this.page = await this.context.newPage();
    this.page.on('response',response=>{
      const url=new URL(response.url());
      if(url.origin===this.origin && /^\/(game-art|fonts|audio)\//.test(url.pathname)) {
        const task=response.body().then(bytes=>{this.assets[url.pathname]=createHash('sha256').update(bytes).digest('hex');});
        this.assetRequests.push(task);
      }
    });
    this.page.on('pageerror', error => process.stderr.write(`Runner page: ${error.message}\n`));
    await this.page.goto(`${this.origin}/environment/runner.html`, {waitUntil:'networkidle',timeout:120000});
    await this.page.waitForFunction(() => Boolean(window.sciconFlyEnvironment), {timeout:120000});
    this.runtime = {chromium:this.browser.version(), viewport:{width:390,height:844},deviceScaleFactor:1,renderProfile:this.renderProfile,decisionHz:20,gameHz:60};
  }
  async command(command) {
    if (command.op === 'close') { await this.close(); return {closed:true}; }
    await this.open();
    if (command.op === 'reset') { this.last = null; this.violations.length = 0; }
    if (command.op === 'step' && this.last?.seq === command.seq) {
      if (this.last.action !== JSON.stringify(command.action)) throw new Error('Sequence reused with different action');
      return this.last.result;
    }
    const result = await this.page.evaluate(async c => {
      const env = window.sciconFlyEnvironment;
      if (c.op === 'reset') return await env.reset({seed:c.seed,episode:c.episode});
      if (c.op === 'step') return await env.step(c.action,c.seq);
      if (c.op === 'state') return env.getState();
      if (c.op === 'frame') return env.getFrame();
      throw new Error('Unknown engine operation');
    }, command);
    if (command.op === 'reset') {
      const gpu = await this.page.evaluate(() => {
        const canvas = document.querySelector('#arena canvas');
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!gl) throw new Error('The canonical renderer did not create a WebGL context');
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        if (!extension) throw new Error('The render profile cannot be verified without WebGL renderer information');
        return {renderer:gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),vendor:gl.getParameter(extension.UNMASKED_VENDOR_WEBGL),version:gl.getParameter(gl.VERSION)};
      });
      const valid = this.renderProfile === 'swiftshader'
        ? /SwiftShader/i.test(gpu.renderer)
        : /D3D11|Direct3D11/i.test(gpu.renderer) && !/SwiftShader/i.test(gpu.renderer);
      if (!valid) throw new Error(`Requested render profile ${this.renderProfile} does not match actual renderer: ${gpu.renderer}`);
      this.runtime.webgl = gpu.renderer;
      this.runtime.gpu = gpu;
    }
    if (this.violations.length) throw new Error(`Runner attempted prohibited requests: ${this.violations.join(', ')}`);
    if (result.observation) result.observation.sha256 = createHash('sha256').update(Buffer.from(result.observation.grayBase64,'base64')).digest('hex');
    if (result.frame?.pngDataUrl) result.frame.sha256 = createHash('sha256').update(Buffer.from(result.frame.pngDataUrl.split(',')[1],'base64')).digest('hex');
    if (result.state) result.stateHash = createHash('sha256').update(JSON.stringify(result.state)).digest('hex');
    if (result.events) result.eventsHash = createHash('sha256').update(JSON.stringify(result.events)).digest('hex');
    await Promise.all(this.assetRequests);
    this.runtime.assetManifest=Object.fromEntries(Object.entries(this.assets).sort(([a],[b])=>a.localeCompare(b)));
    this.runtime.assetHash=createHash('sha256').update(JSON.stringify(this.runtime.assetManifest)).digest('hex');
    result.runtimeIdentity = structuredClone(this.runtime);
    if (command.op === 'step') this.last = {seq:command.seq,action:JSON.stringify(command.action),result};
    return result;
  }
  async close() { await this.browser?.close(); this.browser = null; this.context=null; this.page=null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--render-profile')) throw new Error('Usage: driver.mjs [--render-profile swiftshader|local-d3d11]');
  const driver = new EngineDriver(undefined, {renderProfile:args[1] ?? 'swiftshader'});
  const lines = readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  try {
    for await (const line of lines) {
      let id = null;
      try { const c=JSON.parse(line); id=c.id; const result=await driver.command(c); process.stdout.write(JSON.stringify({id,ok:true,result})+'\n'); }
      catch(error) { process.stdout.write(JSON.stringify({id,ok:false,error:String(error.message??error)})+'\n'); }
    }
  } finally { await driver.close(); }
}
