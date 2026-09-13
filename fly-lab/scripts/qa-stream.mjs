for(const origin of ['http://127.0.0.1:8766','http://127.0.0.1:5180/lab-api']) {
  const start=Date.now();let total=0;
  try {
    const response=await fetch(origin+'/anatomy',{signal:AbortSignal.timeout(15000)});
    console.log(origin,Object.fromEntries(response.headers));
    for await(const chunk of response.body){total+=chunk.length;}
    console.log({origin,total,ms:Date.now()-start});
  } catch(error){console.log({origin,total,error:error.message,ms:Date.now()-start});}
}
