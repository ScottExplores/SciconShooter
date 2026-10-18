/** Browser-side SVG typography audit, including same-origin SVG image cards. */
export async function auditSvgTextGeometry() {
  const violations = [];
  let checkedSvgTexts = 0;
  const visible = element => {
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  };
  const scope = [...document.querySelectorAll('[aria-modal="true"],dialog[open]')].filter(visible).at(-1) || document.body;
  const round = value => Math.round(value * 10) / 10;
  const rect = box => ({ x:round(box.x),y:round(box.y),width:round(box.width),height:round(box.height) });
  const overlap = (a,b) => Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>2 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>2;
  const inspect = (svg, source, imageBox) => {
    const view = svg.viewBox.baseVal;
    imageBox ||= svg.getBoundingClientRect();
    const mapRect = box => imageBox ? {x:imageBox.x+(box.x-view.x)*imageBox.width/view.width,y:imageBox.y+(box.y-view.y)*imageBox.height/view.height,width:box.width*imageBox.width/view.width,height:box.height*imageBox.height/view.height} : box;
    const texts = [...svg.querySelectorAll('text')].filter(element => element.textContent?.trim()).map(element => ({element,box:element.getBBox()}));
    checkedSvgTexts += texts.length;
    const label = element => element.id ? `#${element.id}` : element.hasAttribute('data-record-text') ? `[data-record-text="${element.getAttribute('data-record-text')}"]` : '';
    const add = (type, entry, other) => violations.push({type,selector:`${source} text${label(entry.element)}`,text:entry.element.textContent.trim().slice(0,180),rect:rect(mapRect(entry.box)),...(other?{related:`${source} text${label(other.element)}`,relatedRect:rect(mapRect(other.box))}:{})});
    for (const entry of texts) {
      const declared = entry.element.getAttribute('data-ui-text-bounds')?.split(',').map(Number);
      const bounds = declared?.length === 4 && declared.every(Number.isFinite) ? {x:declared[0],y:declared[1],width:declared[2],height:declared[3]} : {x:view.x,y:view.y,width:view.width,height:view.height};
      const box = entry.box;
      if (box.x < bounds.x - 2 || box.x + box.width > bounds.x + bounds.width + 2 || box.y < bounds.y - 2 || box.y + box.height > bounds.y + bounds.height + 2) add('svg-text-outside-column',entry);
    }
    for (let i=0;i<texts.length;i++) for(let j=i+1;j<texts.length;j++) if(overlap(texts[i].box,texts[j].box)) add('svg-text-overlap',texts[i],texts[j]);
  };
  for (const svg of scope.querySelectorAll('svg')) if(visible(svg) && svg.querySelector('text') && svg.viewBox.baseVal.width) inspect(svg,svg.id?`#${svg.id}`:'inline-svg');
  for (const img of scope.querySelectorAll('img')) {
    const src = img.currentSrc || img.src;
    if (!visible(img) || !/(?:record-card(?:[?/#]|$)|\.svg(?:[?#]|$)|^data:image\/svg\+xml)/.test(src)) continue;
    let probe;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`SVG image HTTP ${response.status}`);
      const xml = new DOMParser().parseFromString(await response.text(),'image/svg+xml');
      const sourceSvg = xml.documentElement;
      if(sourceSvg.tagName.toLowerCase()!=='svg') continue;
      // The fetched image is inspected in an inert hidden probe. Strip active
      // content and image resources: only text geometry is needed here.
      for(const node of sourceSvg.querySelectorAll('script,foreignObject,image,style'))node.remove();
      probe=document.createElement('div');probe.style.cssText='position:fixed;left:-100000px;top:0;width:1200px;height:1200px;visibility:hidden;pointer-events:none';
      const svg=document.importNode(sourceSvg,true);probe.append(svg);document.body.append(probe);
      await document.fonts.ready;
      inspect(svg,'svg-image(record-card)',img.getBoundingClientRect());
    } catch(error) {
      violations.push({type:'svg-image-audit-error',selector:'svg-image(record-card)',text:String(error.message).slice(0,180),rect:rect(img.getBoundingClientRect())});
    } finally {probe?.remove();}
  }
  return {checkedSvgTexts,violations};
}
