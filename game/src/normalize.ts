// Runtime safety net for the revised Uzbek alphabet: converts visible text and labels that still use oʻ/gʻ/sh/ch
// (legacy screens, AI replies, third-party strings). Form fields, code and [data-raw] subtrees are left untouched.
import { translateText } from './i18n';

const SKIP = 'textarea,input,script,style,code,pre,[data-raw],.user,[contenteditable=true]'; // <option> labels are display text and get converted
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];


function fixText(node: Text) {
  const v = node.nodeValue;
  if (!v || node.parentElement?.closest(SKIP)) return;
  const r = translateText(v);
  if (r !== v) node.nodeValue = r;
}
function fixElement(el: Element) {
  if (el.closest(SKIP) && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const r = translateText(v); if (r !== v) el.setAttribute(a, r); } }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { fixText(root as Text); return; }
  if (!(root instanceof Element) && root !== document.body) return;
  if (root instanceof Element) { if (root.matches(SKIP) && !(root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement)) return; fixElement(root); }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) n.nodeType === Node.TEXT_NODE ? fixText(n as Text) : fixElement(n as Element);
}

export function installAlphabetNormalizer() {
  const title = () => { const r = translateText(document.title); if (r !== document.title) document.title = r; };
  walk(document.body); title();
  new MutationObserver(records => {
    for (const m of records) {
      if (m.type === 'characterData') fixText(m.target as Text);
      else if (m.type === 'attributes') fixElement(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const head = document.querySelector('title');
  if (head) new MutationObserver(title).observe(head, { childList: true, characterData: true, subtree: true });
}
