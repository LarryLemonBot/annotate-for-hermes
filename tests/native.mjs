import { strict as assert } from 'node:assert'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const { HERMES_TEST_HOME: home, HERMES_SOURCE_DIR: source } = process.env
assert.ok(home && source, 'Use a disposable Hermes home and a development checkout')
const { CDP } = await import(pathToFileURL(join(source, 'apps/desktop/scripts/perf/lib/cdp.mjs')))
const cdp = await CDP.connect({ port: Number(process.env.HERMES_TEST_CDP_PORT || 9359), match: process.env.HERMES_TEST_DEV_PORT || '5209', timeoutMs: 5000 })
const evaluate = body => cdp.eval(`(async()=>{${body}})()`)
const settle = () => new Promise(resolve => setTimeout(resolve, 200))
const out = '.native-test-results'
await mkdir(out,{recursive:true})
const shot = async name => { await settle(); const {data}=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'.png'),Buffer.from(data,'base64')) }
try {
  assert.equal(await evaluate('return await window.hermesDesktop.desktopPluginsRoot()'),join(home,'desktop-plugins'))
  const loaded=await evaluate(`
    const records=(await import('/src/contrib/plugins-store.ts')).$pluginRecords;
    if(records.get()['annotate-for-hermes']?.status!=='loaded')await(await import('/src/contrib/runtime-loader.ts')).discoverRuntimePlugins();
    const record=records.get()['annotate-for-hermes'];
    if(record?.status!=='loaded')throw new Error(JSON.stringify(record));
    window.afhHost=(await import('/src/sdk/index.ts')).host;
    return await window.hermesDesktop.readPluginSource(record.file);
  `)
  const hash=text=>createHash('sha256').update(text).digest('hex')
  assert.equal(hash(loaded.text),hash(await readFile('desktop/plugin.js','utf8')))
  await evaluate(`window.__PERF_DRIVE__.reset();await window.__PERF_DRIVE__.loadTranscript(2);window.afhSubmits=0;window.addEventListener('hermes:composer-submit',()=>window.afhSubmits++);`)
  await settle()
  assert.ok(await evaluate(`const e=document.querySelector('[data-slot="composer-rich-input"]'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===e||e.contains(hit)`),'Composer must be visible, not covered by setup')
  assert.equal(await evaluate(`return await afhHost.composer.setDraft('new','Please address these comments.  ')`),true)
  const initialCount=await evaluate('return window.__PERF_DRIVE__.snapshotMsgs()')
  const passages=[]
  for(let i=0;i<3;i++){
    const text=await evaluate(`
      const seen=new Set();const nodes=[...document.querySelectorAll('[data-slot="aui_assistant-message-root"] p, [data-slot="aui_assistant-message-root"] pre')].filter(n=>{const t=n.textContent.trim();if(!t||seen.has(t))return false;seen.add(t);return true});
      const n=nodes[${i}];if(!n)throw new Error('Need three separate assistant passages');
      n.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const range=document.createRange();range.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(range);
      n.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return n.textContent;
    `)
    await settle()
    assert.deepEqual(await evaluate(`return [...document.querySelectorAll('[data-afh="toolbar"] button')].map(b=>b.textContent)`),['Add to chat'])
    await evaluate(`document.querySelector('.afh-add').click()`)
    await cdp.send('Input.insertText',{text:`Comment ${i+1}: please expand this point.`})
    if(!i)await shot('comment-editor')
    await evaluate(`document.querySelector('.afh-save').click()`)
    await settle()
    const draft=await evaluate(`return await afhHost.composer.getDraft('new')`)
    const match=draft.match(/@annotation:`([^`]+)`/)
    assert.ok(match)
    const annotations=JSON.parse(match[1]).annotations
    assert.equal(annotations.length,i+1)
    assert.equal(annotations[i].text.trim(),text.trim())
    assert.equal(annotations[i].comment,`Comment ${i+1}: please expand this point.`)
    assert.ok(draft.endsWith('Please address these comments.  '))
    assert.equal(await evaluate(`return document.querySelectorAll('[data-slot="composer-rich-input"] [data-ref-kind="annotation"]').length`),1)
    passages.push(text)
  }
  assert.equal(new Set(passages).size,3)
  await shot('composer-attachment')
  await evaluate(`document.querySelector('[data-ref-kind="annotation"]').click()`)
  await settle()
  assert.equal(await evaluate(`return document.querySelectorAll('.afh-item').length`),3)
  await shot('annotation-preview')
  await evaluate(`document.querySelector('[aria-label="Edit annotation 2"]').click()`)
  await evaluate(`document.querySelector('.afh-input').select()`)
  await cdp.send('Input.insertText',{text:'Revised second comment.'})
  await evaluate(`document.querySelector('.afh-save').click()`);await settle()
  let payload=JSON.parse((await evaluate(`return await afhHost.composer.getDraft('new')`)).match(/@annotation:`([^`]+)`/)[1])
  assert.equal(payload.annotations[1].comment,'Revised second comment.')
  await evaluate(`document.querySelector('[data-ref-kind="annotation"]').click()`);await settle()
  await evaluate(`document.querySelector('[aria-label="Remove annotation 1"]').click()`);await settle()
  assert.equal(await evaluate('return document.querySelectorAll(".afh-item").length'),2)
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  assert.equal(await evaluate(`return getComputedStyle(document.querySelector('.afh-panel')).animationName`),'none')
  await cdp.send('Emulation.setEmulatedMedia',{features:[]})
  await evaluate(`document.querySelector('[aria-label="Close annotations"]').click();document.querySelector('[data-annotation-remove]').click()`);await settle()
  assert.equal(await evaluate(`return await afhHost.composer.getDraft('new')`),'Please address these comments.  ')
  assert.equal(await evaluate('return window.afhSubmits'),0)
  assert.equal(await evaluate('return window.__PERF_DRIVE__.snapshotMsgs()'),initialCount)
  const receipt={passed:true,sourceHash:hash(loaded.text),nativeComposer:true,isolated:true,separateSelections:3,oneAttachment:true,editAndRemove:true,draftPreserved:true,reduceMotion:true,automaticSubmits:0}
  await writeFile(join(out,'receipt.json'),JSON.stringify(receipt,null,2))
  console.log(JSON.stringify(receipt,null,2))
} finally {cdp.close()}
