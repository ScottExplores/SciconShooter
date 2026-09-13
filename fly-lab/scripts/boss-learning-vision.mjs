/** Engineered color segmentation of rendered pixels, never privileged entity state.
 * Kept self-contained so Playwright can execute this function in an isolated page
 * call against the completed PNG. Region and color choices are frozen methods.
 */
export async function extractBossPixels(input) {
  let pixels = input.rgba, width = input.width, height = input.height, canvas;
  if (input.pngDataUrl) {
    const picture = new Image(); picture.src = input.pngDataUrl; await picture.decode();
    width = picture.naturalWidth; height = picture.naturalHeight;
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if (!context) throw new Error('Rendered pixel extraction requires a canvas');
    context.drawImage(picture, 0, 0); pixels = context.getImageData(0, 0, width, height).data;
  }
  if (width !== 390 || height !== 844 || !pixels || pixels.length !== width * height * 4) throw new Error('Vision requires the pinned 390x844 RGBA frame');
  const component = (kind) => {
    const cell = 4, columns = Math.ceil(width / cell), rows = Math.ceil(height / cell);
    const counts = new Uint16Array(columns * rows), sx = new Float64Array(counts.length), sy = new Float64Array(counts.length);
    const y0 = Math.round(height * (kind === 'target' ? .115 : .78)), y1 = Math.round(height * (kind === 'target' ? .46 : .965));
    for (let y = y0; y < y1; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, r = pixels[i], g = pixels[i+1], b = pixels[i+2];
      const hit = kind === 'target' ? g > 75 && b > 70 && g > r * 1.18 && b > r * 1.05 && b > g * .5
        : b > 90 && b > g * 1.08 && b > r * 1.25;
      if (hit) {const j = Math.floor(y / cell) * columns + Math.floor(x / cell); counts[j]++; sx[j]+=x; sy[j]+=y;}
    }
    const visited = new Uint8Array(counts.length); let largest = null;
    for (let start = 0; start < counts.length; start++) {
      if (visited[start] || counts[start] < 2) continue;
      const queue = [start]; visited[start] = 1;
      let count = 0, sumX = 0, sumY = 0, minX = width, maxX = 0, minY = height, maxY = 0;
      for (let q = 0; q < queue.length; q++) {
        const j = queue[q], x = j % columns, y = Math.floor(j / columns);
        count += counts[j]; sumX += sx[j]; sumY += sy[j]; minX = Math.min(minX,x*cell);maxX=Math.max(maxX,(x+1)*cell);minY=Math.min(minY,y*cell);maxY=Math.max(maxY,(y+1)*cell);
        for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
          const nx=x+dx,ny=y+dy,n=ny*columns+nx;
          if(nx<0||nx>=columns||ny<0||ny>=rows||visited[n]||counts[n]<2)continue;
          visited[n]=1;queue.push(n);
        }
      }
      const minimumWidth=kind==='target'?80:12;
      if(maxX-minX>=minimumWidth&&maxY-minY>=16&&(!largest||count>largest.count))largest={count,x:sumX/count,y:sumY/count,width:maxX-minX,height:maxY-minY};
    }
    // A boss occupies a large colored area. Small arrival warnings, stars and
    // detached arm fragments must not masquerade as a located hull.
    const minimum = kind === 'target' ? 2000 : 40;
    if (!largest || largest.count < minimum) return null;
    return {...largest, confidence:Math.min(1,largest.count/(kind === 'target' ? 8000 : 200))};
  };
  const target = component('target'), player = component('player');
  const visible = Boolean(target && player);
  const offset = visible ? Math.max(-1,Math.min(1,(target.x-player.x)/(width/2))) : 0;
  const confidence = visible ? Math.min(target.confidence,player.confidence) : 0;
  return {
    features:{targetOffset:offset,targetVisible:visible,playerVisible:Boolean(player),playerX:player?player.x/width:.5,confidence},
    vision:{targetX:target?target.x/width:null,playerX:player?player.x/width:null,relativeX:visible?offset:null,confidence,source:'pixels',method:'rgba-connected-color-v1',targetPixels:target?.count??0,playerPixels:player?.count??0,targetWidth:target?.width??0,playerWidth:player?.width??0},
    ...(input.includeJpeg && canvas ? {image:canvas.toDataURL('image/jpeg',.78)} : {})
  };
}
