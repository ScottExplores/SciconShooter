import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1536,height:1024},serviceWorkers:'block'});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',request=>console.log('requestfailed',request.url(),request.failure()));
try {
  await page.goto('http://127.0.0.1:5180',{waitUntil:'domcontentloaded'});
  await page.locator('.brand').waitFor({timeout:30000});
  for(const endpoint of ['/status','/anatomy','/status','/anatomy','/status']) {
    console.log(await page.evaluate(async endpoint=>{
      const begin=performance.now();const response=await fetch('/lab-api'+endpoint,{signal:AbortSignal.timeout(10000)});
      const body=await response.text();return{endpoint,status:response.status,bytes:body.length,ms:performance.now()-begin};
    },endpoint));
  }
  console.log({pageErrors:errors});
} finally {await browser.close();}
