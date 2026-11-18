// End-to-end check of Annotate plain-text mode on STOCK Hermes Desktop v0.23.2 (no patch).
// Test harness only: it uses app markup to find passages; the plugin itself does not.
import { strict as assert } from 'node:assert'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
const { HERMES_TEST_HOME: home, HERMES_SOURCE_DIR: source } = process.env
assert.ok(home && source, 'Use a disposable Hermes home and a stock Hermes checkout running an isolated perf instance')
const { CDP } = await import(pathToFileURL(join(source, 'apps/desktop/scripts/perf/lib/cdp.mjs')))
const cdp = await CDP.connect({ port: Number(process.env.HERMES_TEST_CDP_PORT || 9359), match: process.env.HERMES_TEST_DEV_PORT || '5209', timeoutMs: 5000 })
const evaluate = body => cdp.eval(`(async()=>{${body}})()`)
const settle = (ms = 300) => new Promise(r => setTimeout(r, ms))
const out = '.stock-test-results'
await mkdir(out, { recursive: true })
const shot = async name => { await settle(); const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); await writeFile(`${out}/${name}.png`, Buffer.from(data, 'base64')) }
const REF = /@(file|folder|url|image|tool|line|terminal|session):(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g
try {
  const info = await evaluate(`
    const m=await import('/src/contrib/plugins-store.ts');const r=m.$pluginRecords.get()['annotate-for-hermes'];
    window.afhHost=(await import('/src/sdk/index.ts')).host;
    return {status:r.status,file:r.file,text:(await window.hermesDesktop.readPluginSource(r.file)).text,hasNativeApi:!!window.afhHost.composer.annotations}`)
  assert.equal(info.status, 'loaded')
  assert.equal(info.hasNativeApi, false, 'this must be a stock desktop with no annotation API')
  const hash = t => createHash('sha256').update(t).digest('hex')
  const pinned = await readFile(join(home, 'plugins/annotate-for-hermes/desktop/plugin.js'), 'utf8')
  assert.equal(hash(info.text), hash(pinned))
  await evaluate(`window.__PERF_DRIVE__.reset();await window.__PERF_DRIVE__.loadTranscript(2);window.afhSubmits=0;window.addEventListener('hermes:composer-submit',()=>window.afhSubmits++);`)
  await settle(800)
  assert.equal(await evaluate(`return await afhHost.composer.setDraft('new','Please address these comments.  ')`), true)
  const before = await evaluate('return window.__PERF_DRIVE__.snapshotMsgs()')
  const passages = []
  for (let i = 0; i < 3; i++) {
    const text = await evaluate(`
      const seen=new Set();const nodes=[...document.querySelectorAll('[data-slot="aui_assistant-message-root"] p, [data-slot="aui_assistant-message-root"] li')].filter(n=>{const t=n.textContent.trim();if(!t||seen.has(t))return false;seen.add(t);return true});
      const n=nodes[${i}];if(!n)throw new Error('Need three assistant passages');
      n.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const range=document.createRange();range.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(range);
      n.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return s.toString();`)
    await settle()
    assert.deepEqual(await evaluate(`return [...document.querySelectorAll('[data-afh="toolbar"] button')].map(b=>b.textContent)`), ['Add to chat'])
    if (!i) await shot('1-selection-toolbar')
    await evaluate(`document.querySelector('.afh-add').click()`)
    await cdp.send('Input.insertText', { text: i === 1 ? 'Cite @file:/etc/hosts here' : `Comment ${i + 1}: please expand this point.` })
    if (!i) await shot('2-comment-editor')
    await evaluate(`document.querySelector('.afh-save').click()`)
    await settle(600)
    const draft = await evaluate(`return await afhHost.composer.getDraft('new')`)
    assert.ok(draft.startsWith(`Comments on your reply (${i + 1}):`), draft.slice(0, 80))
    assert.ok(draft.endsWith('Please address these comments.  '), 'reply text kept')
    assert.equal([...draft.matchAll(REF)].length, 0, 'no live references in the draft')
    assert.ok(draft.includes(`> ${text.split('\n')[0]}`), 'quoted passage present')
    passages.push(text)
  }
  const chips = await evaluate(`return document.querySelectorAll('[data-slot="composer-rich-input"] [data-ref-kind]').length`)
  assert.equal(chips, 0, 'quoted text did not hydrate into chips')
  await shot('3-draft-with-three-comments')
  // Review / remove through the numbered marker.
  const markers = await evaluate(`return document.querySelectorAll('[data-afh="marker"]:not([hidden])').length`)
  let reviewed = false
  if (markers) {
    await evaluate(`document.querySelector('[data-afh="marker"]:not([hidden])').click()`); await settle(600)
    reviewed = await evaluate(`return document.querySelectorAll('.afh-item').length`) === 3
    if (reviewed) { await shot('4-review-panel'); await evaluate(`document.querySelector('[aria-label="Remove annotation 1"]').click()`); await settle(600) }
  }
  const afterRemove = await evaluate(`return await afhHost.composer.getDraft('new')`)
  const removed = afterRemove.startsWith('Comments on your reply (2):')
  const final = await evaluate(`return await afhHost.composer.getDraft('new')`)
  assert.equal(await evaluate('return window.afhSubmits'), 0)
  assert.equal(await evaluate('return window.__PERF_DRIVE__.snapshotMsgs()'), before)
  const receipt = { passed: true, hermes: process.env.HERMES_TEST_LABEL || 'stock', pluginSha256: hash(pinned), nativeApi: false, separateSelections: passages.length, oneBlock: true, referencesNeutralized: true, chipsHydrated: chips, visibleMarkers: markers, markerReview: reviewed, removeViaReview: removed, automaticSubmits: 0, finalDraftHead: final.slice(0, 400) }
  await writeFile(`${out}/receipt.json`, JSON.stringify(receipt, null, 2))
  console.log(JSON.stringify(receipt, null, 2))
} finally { cdp.close() }
