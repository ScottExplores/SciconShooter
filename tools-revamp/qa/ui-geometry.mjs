/** Browser-side text geometry audit. Kept serializable for Playwright evaluate. */
export function auditTextGeometry({ tolerance = 2, centerTolerance = 3 } = {}) {
  const violations = [];
  const seen = new Set();
  // REVAMP(Q): visualViewport excludes browser chrome / keyboards. Read env()
  // through computed padding so this also works on devices with a real notch.
  const visual = window.visualViewport;
  const viewport = { left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0, right: (visual?.offsetLeft || 0) + (visual?.width || innerWidth), bottom: (visual?.offsetTop || 0) + (visual?.height || innerHeight) };
  const safeProbe = document.createElement('div');
  safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(safeProbe);
  const safeStyle = getComputedStyle(safeProbe);
  const safeInsets = { top: parseFloat(safeStyle.paddingTop) || 0, right: parseFloat(safeStyle.paddingRight) || 0, bottom: parseFloat(safeStyle.paddingBottom) || 0, left: parseFloat(safeStyle.paddingLeft) || 0 };
  safeProbe.remove();
  const safeViewport = { left: viewport.left + safeInsets.left, top: viewport.top + safeInsets.top, right: viewport.right - safeInsets.right, bottom: viewport.bottom - safeInsets.bottom };
  // Desktop preserves the canonical world in a CSS-scaled iframe. Minimum
  // touch targets must still occupy 44 visible CSS pixels in the outer shell.
  let frameScale = 1;
  try {
    const frame = window.frameElement;
    if (frame?.offsetWidth && frame.offsetHeight) {
      const bounds = frame.getBoundingClientRect();
      frameScale = Math.min(bounds.width / frame.offsetWidth, bounds.height / frame.offsetHeight);
    }
  } catch { /* A cross-origin embedding cannot expose its display scale. */ }
  const styles = new WeakMap();
  const style = element => { if (!styles.has(element)) styles.set(element, getComputedStyle(element)); return styles.get(element); };
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
  // REVAMP(T): Preview labeling must never paint over a HUD or menu. The
  // canvas check also covers Pixi-only timers / boss bars absent from the DOM.
  // Inspect outside the modal scope because the badge remains visible there.
  let checkedPreviewHudRects = 0;
  const previewBadge = document.querySelector('[data-preview-build-badge]');
  if (previewBadge && rendered(previewBadge)) {
    const badgeBox = previewBadge.getBoundingClientRect();
    if (outsideX(badgeBox, safeViewport) || outsideY(badgeBox, safeViewport)) add('preview-badge-outside-safe-area', previewBadge, previewBadge.textContent || '', badgeBox);
    const hudTargets = document.querySelectorAll('.scicon-combat-toprow, .scicon-hud-shell button, .scicon-hud-shell [role="progressbar"], .scicon-wave-progress, .scicon-game-stage canvas, [data-preview-hud]');
    for (const target of hudTargets) {
      if (!rendered(target)) continue;
      checkedPreviewHudRects++;
      const targetBox = target.getBoundingClientRect();
      if (Math.min(badgeBox.right, targetBox.right) > Math.max(badgeBox.left, targetBox.left)
        && Math.min(badgeBox.bottom, targetBox.bottom) > Math.max(badgeBox.top, targetBox.top)) add('preview-badge-overlaps-hud', previewBadge, previewBadge.textContent || '', badgeBox, target);
    }
    const content = document.querySelector('.scicon-preview-content');
    if (content && intersects(badgeBox, content.getBoundingClientRect())) add('preview-badge-overlaps-content', previewBadge, previewBadge.textContent || '', badgeBox, content);
  }
  const union = boxes => boxes.reduce((result, box) => ({ left: Math.min(result.left, box.left), top: Math.min(result.top, box.top), right: Math.max(result.right, box.right), bottom: Math.max(result.bottom, box.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const boxRect = bounds => ({ ...bounds, x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top });
  const inFlowOf = (element, container) => {
    for (let node = element; node && node !== container; node = node.parentElement) if (['absolute','fixed'].includes(style(node).position)) return false;
    return true;
  };
  // Scroll content is intentionally available beyond its viewport. Audit its
  // painted portion, while hidden/clip overflow is still treated as a defect.
  const scrollVisibleRect = (box, element) => {
    const visible = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const css = style(ancestor), bounds = ancestor.getBoundingClientRect();
      if (/auto|scroll/.test(css.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + tolerance) { visible.left = Math.max(visible.left, bounds.left); visible.right = Math.min(visible.right, bounds.right); }
      if (/auto|scroll/.test(css.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + tolerance) { visible.top = Math.max(visible.top, bounds.top); visible.bottom = Math.min(visible.bottom, bounds.bottom); }
    }
    return visible;
  };
  const frameBounds = element => {
    const numbers = element.getAttribute('data-frame-inner-rect')?.trim().split(/[\s,]+/).map(Number);
    if (!numbers || numbers.length !== 4 || numbers.some(number => !Number.isFinite(number) || number < 0 || number > 100) || numbers[0] >= numbers[2] || numbers[1] >= numbers[3]) return null;
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left + bounds.width * numbers[0] / 100, top: bounds.top + bounds.height * numbers[1] / 100, right: bounds.left + bounds.width * numbers[2] / 100, bottom: bounds.top + bounds.height * numbers[3] / 100 };
  };
  let checkedFrameTexts = 0;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node; let checkedTextNodes = 0;
  const texts = [], alignmentTexts = [];
  while ((node = walker.nextNode())) {
    const value = node.textContent || '', owner = node.parentElement;
    if (!value.trim() || !owner || ['SCRIPT', 'STYLE', 'OPTION', 'TITLE'].includes(owner.tagName) || !rendered(owner)) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const ranges = [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0);
    // Alignment uses a label's complete flow even at a normal scroll boundary;
    // clipping away its lower lines must not move its measured vertical center.
    alignmentTexts.push(...ranges.map(box => ({owner,box,value})));
    const visibleRanges = ranges.filter(box => unobscured(box, owner));
    if (!visibleRanges.length) continue;
    checkedTextNodes++;
    const ownerBox = owner.getBoundingClientRect();
    const css = style(owner);
    for (const box of visibleRanges) {
      texts.push({ owner, box, value });
      const frame = owner.closest('[data-frame-inner-rect]');
      if (frame) {
        checkedFrameTexts++;
        const interior = frameBounds(frame), painted = scrollVisibleRect(box, owner);
        if (!interior) add('invalid-frame-inner-rect', frame, frame.getAttribute('data-frame-inner-rect') || '', frame.getBoundingClientRect());
        else if (outsideX(painted, interior) || outsideY(painted, interior)) add('text-in-frame-border', owner, value, box, frame);
      }
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
  // Unlike collision checks, viewport checks retain wholly offscreen controls.
  // Only content genuinely reachable through a scrollport is deferred to its
  // later scroll capture. A hidden/clip ancestor cannot hide a failed button.
  let checkedSafeControls = 0;
  for (const element of scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="slider"],[role="menuitem"],[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"])')) {
    if (!rendered(element)) continue;
    const box = element.getBoundingClientRect(), painted = scrollVisibleRect(box, element);
    if (painted.right - painted.left <= tolerance || painted.bottom - painted.top <= tolerance) continue;
    checkedSafeControls++;
    const label = element.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder') || '';
    if (outsideX(painted, viewport) || outsideY(painted, viewport)) add('control-outside-visual-viewport', element, label, box);
    else if (outsideX(painted, safeViewport) || outsideY(painted, safeViewport)) add('control-under-safe-area', element, label, box);
    const minTarget = Number(element.closest('[data-ui-min-target]')?.getAttribute('data-ui-min-target'));
    if (minTarget > 0 && box.height * frameScale < minTarget - 0.1) add('control-below-min-target', element, label, box);
  }
  // A text + icon button is a centered group. Ordinary text-align:center
  // blocks are checked line-by-line, so a long wrapping title cannot hide a
  // shifted short line. Vertical checks require a contract or a control whose
  // flex/grid layout explicitly centers the content on that axis.
  let checkedCenters = 0;
  for (const element of scope.querySelectorAll('*')) {
    if (!rendered(element) || element.closest('[data-ui-center="off"]')) continue;
    const css = style(element), explicit = element.getAttribute('data-ui-center');
    const control = element.matches('button,a[href],[role="button"],summary');
    const textChildren = [...element.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    const inlineChildren = [...element.children].every(child => style(child).display === 'inline' || style(child).display === 'inline-block' || ['absolute','fixed'].includes(style(child).position));
    const positionedLabels = !textChildren && element.children.length > 0 && [...element.children].every(child => ['absolute','fixed'].includes(style(child).position));
    const centeredLayout = /flex/.test(css.display) ? (css.flexDirection.startsWith('row') ? css.justifyContent === 'center' : css.alignItems === 'center') : /grid/.test(css.display) ? css.gridTemplateColumns.trim().split(/\s+/).length === 1 && ['center','normal','stretch'].includes(css.justifyItems) : true;
    const horizontalLayout = css.textAlign === 'center' && css.display !== 'inline' && centeredLayout && !positionedLabels && (control || textChildren || inlineChildren);
    const verticalLayout = control && !positionedLabels && (/flex/.test(css.display) ? (css.flexDirection.startsWith('row') ? css.alignItems === 'center' : css.justifyContent === 'center') : /grid/.test(css.display) && css.alignItems === 'center');
    const inferred = horizontalLayout || verticalLayout;
    if (!explicit && !inferred) continue;
    if (explicit && !['x','y','both'].includes(explicit)) continue;
    const axes = explicit || (horizontalLayout ? (verticalLayout ? 'both' : 'x') : 'y');
    // A positioned corner badge or day heading has its own alignment box; it
    // is not part of the button's flex/grid label group. It is still audited
    // independently for centering, clipping, frame bounds and safe areas.
    const belongsToLabel = text => element.contains(text.owner) && (!control || inFlowOf(text.owner, element));
    const content = texts.filter(belongsToLabel);
    if (!content.length) continue;
    const bounds = element.getBoundingClientRect();
    const alignmentBounds = frameBounds(element) || bounds;
    // A shrink-to-text inline box is not the intended alignment container.
    if (bounds.width <= 0 || bounds.height <= 0) continue;
    const boxes = content.map(text => text.box);
    if (control || explicit) for (const icon of element.querySelectorAll('img,svg,canvas,[data-ui-center-icon]')) {
      const iconStyle = style(icon);
      if (!rendered(icon) || ['absolute','fixed'].includes(iconStyle.position) || (control && !inFlowOf(icon, element))) continue;
      // Icon capsules are visible content too. Measuring only an optically
      // shifted glyph inside its padded capsule invents a group offset.
      let paintedIcon = icon;
      for (let parent = icon.parentElement; parent && parent !== element && !parent.textContent.trim(); parent = parent.parentElement) {
        const parentStyle = style(parent);
        if (['absolute','fixed'].includes(parentStyle.position)) break;
        if (parentStyle.backgroundImage !== 'none' || !['rgba(0, 0, 0, 0)','transparent'].includes(parentStyle.backgroundColor) || ['Top','Right','Bottom','Left'].some(side => parseFloat(parentStyle[`border${side}Width`]) > 0)) paintedIcon = parent;
      }
      boxes.push(paintedIcon.getBoundingClientRect());
    }
    const aggregate = union([...boxes, ...alignmentTexts.filter(belongsToLabel).map(text => text.box)]);
    const flexGroup = /flex/.test(css.display) && css.flexDirection.startsWith('row');
    const groups = [];
    if (flexGroup) groups.push(boxes);
    else for (const box of boxes) {
      const line = groups.find(group => Math.min(group[0].bottom, box.bottom) > Math.max(group[0].top, box.top));
      if (line) line.push(box); else groups.push([box]);
    }
    for (const group of groups) {
      const contentBox = boxRect(union(group));
      // Horizontal line alignment waits until the line is fully exposed.
      // Vertical alignment still uses the complete label's uncut flow above.
      const painted = scrollVisibleRect(contentBox, element);
      const checkX = axes !== 'y' && !outsideX(contentBox, painted) && !outsideY(contentBox, painted);
      const checkY = ['y','both'].includes(axes);
      if (!checkX && !checkY) continue;
      checkedCenters++;
      const centerX = Math.abs((contentBox.left + contentBox.right - alignmentBounds.left - alignmentBounds.right) / 2);
      const centerY = Math.abs((aggregate.top + aggregate.bottom - alignmentBounds.top - alignmentBounds.bottom) / 2);
      if ((checkX && centerX > centerTolerance) || (checkY && centerY > centerTolerance)) {
        add('text-off-center', element, element.textContent || '', contentBox);
        const item = violations.at(-1);
        if (item?.type === 'text-off-center' && item.selector === selector(element)) { item.centerOffset = { x: Math.round(centerX * 10) / 10, y: Math.round(centerY * 10) / 10 }; item.expectedAxes = axes; }
      }
    }
  }
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
  return { checkedTextNodes, checkedControls: controls.length, checkedCenters, checkedFrameTexts, checkedSafeControls, checkedPreviewHudRects, viewport, safeInsets, frameScale, violations };
}
