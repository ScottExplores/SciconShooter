/** Browser-side text geometry audit. Kept serializable for Playwright evaluate. */
export function auditTextGeometry({ tolerance = 2 } = {}) {
  const violations = [];
  const seen = new Set();
  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const style = element => getComputedStyle(element);
  const rect = box => ({ x: Math.round(box.x * 10) / 10, y: Math.round(box.y * 10) / 10, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10 });
  const intersects = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
  const outsideX = (a, b) => a.left < b.left - tolerance || a.right > b.right + tolerance;
  const outsideY = (a, b) => a.top < b.top - tolerance || a.bottom > b.bottom + tolerance;
  const selector = element => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const classes = [...element.classList].slice(0, 3).map(name => `.${CSS.escape(name)}`).join('');
    return `${element.tagName.toLowerCase()}${classes}`;
  };
  const rendered = element => {
    if (!element.getClientRects().length) return false;
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const css = style(node);
      if (node.getAttribute('aria-hidden') === 'true') {
        const painted = visibleRect(node.getBoundingClientRect(), node);
        if (painted.right - painted.left <= tolerance || painted.bottom - painted.top <= tolerance) return false;
      }
      if (node.tagName === 'DETAILS' && !node.open && !node.querySelector(':scope > summary')?.contains(element)) return false;
      if (css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) === 0) return false;
      // Accessible-only labels deliberately occupy a 1px clipped rectangle.
      if ((css.clip !== 'auto' || css.clipPath === 'inset(50%)') && node.clientWidth <= 1 && node.clientHeight <= 1) return false;
    }
    return true;
  };
  const visibleRect = (box, element) => {
    let visible = { left: Math.max(0, box.left), top: Math.max(0, box.top), right: Math.min(innerWidth, box.right), bottom: Math.min(innerHeight, box.bottom) };
    for (let node = element.parentElement; node; node = node.parentElement) {
      const css = style(node), bounds = node.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(css.overflowX)) { visible.left = Math.max(visible.left, bounds.left); visible.right = Math.min(visible.right, bounds.right); }
      if (/auto|scroll|hidden|clip/.test(css.overflowY)) { visible.top = Math.max(visible.top, bounds.top); visible.bottom = Math.min(visible.bottom, bounds.bottom); }
    }
    return visible;
  };
  // A modal intentionally obscures its background. Within the active modal (or
  // page), keep fully obscured siblings: their collision is precisely a defect.
  const dialogs = [...document.querySelectorAll('[aria-modal="true"],dialog[open]')].filter(rendered);
  const scope = dialogs.at(-1) || document.body;
  const unobscured = (box, element) => {
    if (!scope.contains(element)) return false;
    const visible = visibleRect(box, element);
    if (visible.right - visible.left > 1 && visible.bottom - visible.top > 1) return true;
    // Hidden clipping is a defect even when it hides an entire line. A normal
    // scrollport, in contrast, is audited when that line scrolls into view.
    let onScreenContainer = intersects(element.getBoundingClientRect(), viewport);
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const css = style(ancestor), bounds = ancestor.getBoundingClientRect();
      if (/auto|scroll/.test(css.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + tolerance
        && (box.bottom <= bounds.top || box.top >= bounds.bottom)) return false;
      if (/auto|scroll/.test(css.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + tolerance
        && (box.right <= bounds.left || box.left >= bounds.right)) return false;
      if (/hidden|clip/.test(`${css.overflowX} ${css.overflowY}`) && intersects(bounds, viewport)) onScreenContainer = true;
    }
    return onScreenContainer;
  };
  const add = (type, element, text, box, other) => {
    const item = { type, selector: selector(element), text: text.trim().replace(/\s+/g, ' ').slice(0, 180), rect: rect(box), ...(other ? { related: selector(other), relatedRect: rect(other.getBoundingClientRect()) } : {}) };
    const key = `${type}|${item.selector}|${item.text}|${item.related || ''}`;
    if (!seen.has(key)) { seen.add(key); violations.push(item); }
  };
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node; let checkedTextNodes = 0;
  const texts = [];
  while ((node = walker.nextNode())) {
    const value = node.textContent || '', owner = node.parentElement;
    if (!value.trim() || !owner || ['SCRIPT', 'STYLE', 'OPTION', 'TITLE'].includes(owner.tagName) || !rendered(owner)) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const ranges = [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0);
    const visibleRanges = ranges.filter(box => unobscured(box, owner));
    if (!visibleRanges.length) continue;
    checkedTextNodes++;
    const ownerBox = owner.getBoundingClientRect();
    const css = style(owner);
    for (const box of visibleRanges) {
      texts.push({ owner, box, value });
      if (outsideX(box, ownerBox) || outsideY(box, ownerBox)) add('text-outside-own-box', owner, value, box);
      let scrollX = false, scrollY = false, panelFound = false;
      for (let ancestor = owner; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const ancestorStyle = style(ancestor), bounds = ancestor.getBoundingClientRect();
        const scrollableX = /auto|scroll/.test(ancestorStyle.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + tolerance;
        const scrollableY = /auto|scroll/.test(ancestorStyle.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + tolerance;
        scrollX ||= scrollableX; scrollY ||= scrollableY;
        if ((!scrollX && /hidden|clip/.test(ancestorStyle.overflowX) && outsideX(box, bounds)) || (!scrollY && /hidden|clip/.test(ancestorStyle.overflowY) && outsideY(box, bounds))) add('text-clipped', owner, value, box, ancestor);
        const panel = ancestor !== owner && (ancestor.hasAttribute('data-ui-panel') || ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(ancestorStyle[`border${side}Width`]) > 0));
        if (!panelFound && panel) {
          panelFound = true;
          const interior = { left: bounds.left + parseFloat(ancestorStyle.borderLeftWidth), right: bounds.right - parseFloat(ancestorStyle.borderRightWidth), top: bounds.top + parseFloat(ancestorStyle.borderTopWidth), bottom: bounds.bottom - parseFloat(ancestorStyle.borderBottomWidth) };
          if ((!scrollX && outsideX(box, interior)) || (!scrollY && outsideY(box, interior))) add('text-outside-panel', owner, value, box, ancestor);
        }
      }
    }
    if (css.display !== 'inline' && owner.clientWidth > 0 && owner.scrollWidth > owner.clientWidth + tolerance && !/auto|scroll/.test(css.overflowX) && !owner.querySelector('img,svg,canvas')) add('horizontal-scroll-overflow', owner, value, ownerBox);
  }
  // A coachmark intentionally paints over inactive game controls while keeping
  // the highlighted gameplay target interactive. Exclude only cross-layer
  // collisions; both the coachmark and underlying HUD retain all box checks.
  const separateCoachmarkLayers = (a,b) => {
    const first = a.closest('[data-onboarding-step]'), second = b.closest('[data-onboarding-step]');
    return first !== second && Boolean(first || second);
  };
  const controls = [...scope.querySelectorAll('button,a[href],input,select,textarea,[role="button"],summary')].filter(rendered).map(element => ({ element, box: element.getBoundingClientRect() })).filter(({ element, box }) => intersects(box, viewport) && unobscured(box, element));
  for (const { owner, box, value } of texts) {
    const ownControl = owner.closest('button,a[href],input,select,textarea,[role="button"],summary');
    for (const control of controls) {
      if (control.element === ownControl || control.element.contains(owner) || owner.contains(control.element) || separateCoachmarkLayers(owner,control.element)) continue;
      if (intersects(visibleRect(box, owner), visibleRect(control.box, control.element))) add('text-overlaps-control', owner, value, box, control.element);
    }
  }
  // Input values/placeholders and native selected labels live outside DOM text
  // nodes. Measure with the actual loaded font instead of silently skipping them.
  const measure = document.createElement('canvas').getContext('2d');
  for (const { element, box } of controls) {
    if (!['INPUT', 'SELECT'].includes(element.tagName) || element.type === 'password' || !measure) continue;
    if (element.tagName === 'INPUT' && !['text','search','email','url','tel','number'].includes(element.type)) continue;
    const value = element.tagName === 'SELECT' ? element.selectedOptions[0]?.textContent || '' : element.value || element.placeholder || '';
    if (!value.trim()) continue;
    const css = style(element);
    measure.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    const textWidth = measure.measureText(value).width + Math.max(0, value.length - 1) * (parseFloat(css.letterSpacing) || 0);
    const available = element.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) - (element.tagName === 'SELECT' && css.appearance !== 'none' ? 18 : 0);
    if (textWidth > available + tolerance) add('input-text-clipped', element, value, box);
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.element.contains(b.element) || b.element.contains(a.element) || separateCoachmarkLayers(a.element,b.element)) continue;
    if (intersects(visibleRect(a.box, a.element), visibleRect(b.box, b.element))) add('controls-overlap', a.element, a.element.textContent || a.element.getAttribute('aria-label') || '', a.box, b.element);
  }
  return { checkedTextNodes, checkedControls: controls.length, violations };
}
