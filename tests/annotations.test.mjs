import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest'
import {AnnotateController,readAttachments,replaceAttachment} from '../desktop/plugin.js'
import {createSdk} from './sdk.mjs'
let controller,state,api,sdk
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
const capture=(text='Selected passage')=>({text,session:state.session,anchor:{left:24,top:200,bottom:220}})
const comment=async text=>{const input=document.querySelector('textarea');input.value=text;input.dispatchEvent(new Event('input'));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush()}
const attachment=()=>readAttachments(state.drafts.get(state.session),api)[0]
beforeEach(()=>{document.body.innerHTML='';({sdk,state,api}=createSdk());controller=new AnnotateController(sdk);controller.mount()})
afterEach(()=>{controller.dispose();vi.unstubAllGlobals()})
describe('annotation workflow',()=>{
  it('collects multiple distinct selections and comments in one attachment, preserving the entire draft',async()=>{
    for(let i=1;i<=3;i++){controller.edit(capture('Passage '+i));await comment('Comment '+i)}
    const parts=readAttachments(state.drafts.get('chat-a'),api)
    expect(parts).toHaveLength(1)
    expect(parts[0].data.annotations.map(a=>[a.text,a.comment])).toEqual([['Passage 1','Comment 1'],['Passage 2','Comment 2'],['Passage 3','Comment 3']])
    expect(state.drafts.get('chat-a').endsWith('\n\nExisting reply  ')).toBe(true)
    expect(state.submits).toBe(0)
  })
  it('edits and removes individual comments, and removing the group restores the original reply exactly',async()=>{
    for(let i=1;i<=2;i++){controller.edit(capture('Passage '+i));await comment('Comment '+i)}
    await controller.open({value:attachment().value,editable:true})
    document.querySelector('[aria-label="Edit annotation 2"]').click()
    await comment('Revised')
    expect(attachment().data.annotations[1].comment).toBe('Revised')
    await controller.open({value:attachment().value,editable:true})
    document.querySelector('[aria-label="Remove annotation 1"]').click();await flush()
    expect(attachment().data.annotations).toHaveLength(1)
    expect(document.querySelector('[data-afh="review"]').textContent).toContain('Revised')
    await controller.open({value:attachment().value,editable:true,remove:true})
    expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
    expect(state.submits).toBe(0)
  })
  it('keeps a failed comment editable and retries without duplicating it',async()=>{
    state.fail=true;controller.edit(capture());await comment('Keep me')
    expect(document.querySelector('textarea').value).toBe('Keep me')
    expect(document.querySelector('[role="alert"]').textContent).toContain('unavailable')
    expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
    state.fail=false;document.querySelector('.afh-save').click();await flush()
    expect(attachment().data.annotations).toHaveLength(1)
  })
  it('never writes into another chat when switching while a comment is being staged',async()=>{
    controller.edit(capture());state.session='chat-b';await comment('Private to A')
    expect(state.drafts.get('chat-b')).toBe('Other chat')
    expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
    expect(document.querySelector('[role="alert"]').textContent).toContain('original chat')
  })
  it('separates identical draft IDs on different profiles and restores unfinished comments only to their owner',async()=>{
    let profile='personal';sdk.state.profile={get:()=>profile}
    controller.edit(capture());const input=document.querySelector('textarea');input.value='Unfinished';input.dispatchEvent(new Event('input'))
    profile='work';await comment('Wrong destination')
    expect(state.writes).toBe(0)
    profile='personal';controller.close(false);controller.edit(controller.pending.get(controller.scope()))
    expect(document.querySelector('textarea').value).toBe('Wrong destination')
    expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
  })
  it('rejects stale edits instead of overwriting a newer comment',async()=>{
    controller.edit(capture());await comment('Original')
    await controller.open({value:attachment().value,editable:true})
    document.querySelector('[aria-label="Edit annotation 1"]').click()
    const before=attachment();const changed=[{...before.data.annotations[0],comment:'Elsewhere'}]
    state.drafts.set('chat-a',replaceAttachment(state.drafts.get('chat-a'),before,changed,api))
    await comment('Stale')
    expect(attachment().data.annotations[0].comment).toBe('Elsewhere')
    expect(document.querySelector('[role="alert"]').textContent).toContain('changed')
  })
  it('preserves code indentation and treats markup, commands and references as content',async()=>{
    const text='  const x = `@file:/private`;\n    <script>bad()</script>\n/reset'
    controller.edit(capture(text));await comment('Keep the formatting')
    expect(attachment().data.annotations[0].text).toBe(text)
    expect(document.querySelector('script')).toBeNull()
    expect(attachment().token).not.toContain('@file:')
    expect(attachment().token).not.toContain('/reset')
  })
  it('Shift Enter and composition Enter do not stage or submit',async()=>{
    controller.edit(capture());const input=document.querySelector('textarea')
    for(const options of [{shiftKey:true},{isComposing:true}])input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,...options}))
    await flush();expect(state.writes).toBe(0);expect(state.submits).toBe(0)
  })
  it('saved-message annotations are read only and cannot be removed via a forged event',async()=>{
    controller.edit(capture());await comment('A comment');const value=attachment().value
    await controller.open({value,editable:false});expect(document.querySelector('[aria-label="Edit annotation 1"]')).toBeNull()
    await controller.open({value,editable:false,remove:true});expect(attachment()).toBeDefined()
  })
  it('unloads listeners and surfaces without touching ordinary chat controls',()=>{
    const normal=document.createElement('button');normal.textContent='Copy';document.body.append(normal)
    controller.edit(capture());controller.dispose()
    expect(document.querySelector('[data-afh]')).toBeNull();expect(normal.isConnected).toBe(true)
    expect(state.open).toBeNull();expect(state.callbacks).toHaveLength(0)
  })
})

describe('selection popup polish',()=>{
  const type=text=>{
    const input=document.querySelector('textarea')
    input.value=text;input.dispatchEvent(new Event('input'))
  }
  it('uses compact dimensions, soft shadow, specified motion and readable primary buttons',()=>{
    const rules=[...controller.style.sheet.cssRules]
    const css=selector=>rules.find(rule=>rule.selectorText===selector).style
    expect(css('.afh-toolbar').height).toBe('28px')
    expect(css('.afh-toolbar').borderRadius).toBe('8px')
    expect(css('.afh-panel').width).toBe('320px')
    expect(css('.afh-surface').animation).toContain('120ms cubic-bezier(.2,0,0,1)')
    expect(css('.afh-panel').animationDuration).toBe('160ms')
    expect(css('.afh-surface').boxShadow).toBe('0 1px 3px light-dark(#00000012,#0000004d),0 4px 16px light-dark(#0000001f,#00000066)')
    const luminance=(rgb,brightness=1)=>rgb.match(/\d+/g).map(value=>Number(value)*brightness/255)
      .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
      .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0)
    const save=css('[data-afh] .afh-save')
    expect(save.background).toBe('var(--afh-save-bg)')
    expect(controller.style.textContent).toContain('--afh-accent:var(--ui-accent,light-dark(#2563eb,#6395f6))')
    expect(controller.style.textContent).toContain('--afh-save-bg:color-mix(in srgb,var(--afh-accent) 60%,#000)')
    // White text over the accent mixed 60% with black, for the fallback and a light and a dark host accent.
    const mixed=hex=>'rgb('+hex.match(/[0-9a-f]{2}/gi).map(v=>Math.round(parseInt(v,16)*.6)).join(',')+')'
    for(const accent of ['#6395f6','#2563eb','#8ab4ff'])for(const brightness of [1,.94])expect((luminance('rgb(255,255,255)',brightness)+.05)/(luminance(mixed(accent),brightness)+.05)).toBeGreaterThanOrEqual(4.5)
    expect(save.cssText).not.toContain('#2563eb')
    expect(css('.afh-save:hover').filter).toBe('brightness(.94)')
    expect(controller.style.textContent).toContain('prefers-reduced-motion:reduce')
  })
  it('labels the toolbar, editor controls and Escape hint',async()=>{
    api.captureSelection=()=>capture();controller.offer()
    expect(controller.toolbar.getAttribute('role')).toBe('toolbar')
    expect(controller.toolbar.getAttribute('aria-label')).toBe('Selection annotation')
    expect(document.querySelector('.afh-add').getAttribute('aria-haspopup')).toBe('dialog')
    document.querySelector('.afh-add').click()
    const input=document.querySelector('textarea')
    const hint=document.getElementById(input.getAttribute('aria-describedby'))
    expect(hint.textContent).toContain('Esc cancel')
    expect(hint.getAttribute('aria-label')).toContain('Escape to cancel')
    expect(document.querySelector('.afh-save').textContent).toBe('Add')
    expect(document.querySelector('.afh-save svg')).toBeNull()
    await comment('Saved')
    await controller.open({value:attachment().value,editable:true})
    document.querySelector('[aria-label="Edit annotation 1"]').click()
    expect(document.querySelector('.afh-save').textContent).toBe('Save')
    type('Unfinished edit')
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    expect(document.querySelector('.afh-confirm-text').textContent).toBe('Discard this comment?')
    expect(controller.pending.get(controller.scope()).comment).toBe('Unfinished edit')
  })
  it('removes the toolbar when the selection clears or becomes ineligible',()=>{
    for(const event of ['selectionchange','mouseup']){
      api.captureSelection=()=>capture();controller.offer()
      expect(controller.toolbar).not.toBeNull()
      api.captureSelection=()=>null
      document.body.dispatchEvent(new Event(event,{bubbles:true}))
      expect(controller.toolbar).toBeNull()
      expect(document.querySelector('[data-afh="toolbar"]')).toBeNull()
    }
  })
  it.each(['text','replacement'])('clears stale highlights after a stream %s rewrite',async mode=>{
    vi.stubGlobal('CSS',{highlights:new Map()})
    vi.stubGlobal('Highlight',class extends Set{constructor(...ranges){super(ranges)}})
    const source=document.createElement('p');source.textContent='Selected passage';document.body.append(source)
    const range=document.createRange();range.selectNodeContents(source.firstChild)
    controller.edit({...capture(),range});await comment('A comment')
    expect(CSS.highlights.get('annotate-for-hermes').size).toBe(1)
    if(mode==='text')source.firstChild.data='Rewritten passage'
    else source.replaceWith(document.createTextNode('Rewritten passage'))
    await flush()
    expect(controller.ranges.size).toBe(0)
    expect(CSS.highlights.get('annotate-for-hermes').size).toBe(0)
  })
  it('offers Resume or Discard for an unfinished comment instead of silently replacing a new selection',()=>{
    controller.edit(capture('First passage'));type('Keep this comment');controller.close(false)
    api.captureSelection=()=>capture('Second passage');controller.offer()
    document.querySelector('.afh-add').click()
    expect(controller.panel.getAttribute('aria-label')).toBe('Unfinished comment')
    expect(document.querySelector('.afh-quote').textContent).toBe('First passage')
    expect(document.querySelector('textarea')).toBeNull()
    document.querySelector('[aria-label="Resume the unsaved comment"]').click()
    expect(document.querySelector('.afh-quote').textContent).toBe('First passage')
    expect(document.querySelector('textarea').value).toBe('Keep this comment')
    controller.close(false)
    controller.edit(capture('Second passage'))
    document.querySelector('[aria-label="Discard it and annotate the new selection"]').click()
    expect(document.querySelector('.afh-quote').textContent).toBe('Second passage')
    expect(document.querySelector('textarea').value).toBe('')
    expect(controller.pending.get(controller.scope()).text).toBe('Second passage')
  })
  it('preserves an unfinished comment when editing a different saved annotation',async()=>{
    controller.edit(capture('Saved passage'));await comment('Saved comment')
    controller.edit(capture('Unfinished passage'));type('Keep me')
    await controller.open({value:attachment().value,editable:true})
    document.querySelector('[aria-label="Edit annotation 1"]').click()
    expect(controller.panel.getAttribute('aria-label')).toBe('Unfinished comment')
    document.querySelector('[aria-label="Resume the unsaved comment"]').click()
    expect(document.querySelector('.afh-quote').textContent).toBe('Unfinished passage')
    expect(document.querySelector('textarea').value).toBe('Keep me')
    expect(attachment().data.annotations[0].comment).toBe('Saved comment')
  })
  it('rejects a draft changed during save and keeps the comment available for retry',async()=>{
    const read=sdk.composer.getDraft
    sdk.composer.getDraft=async session=>{
      const draft=await read(session)
      if(state.reads===1)state.drafts.set(session,'Newer reply  ')
      return draft
    }
    controller.edit(capture());await comment('Keep me')
    expect(state.writes).toBe(0)
    expect(state.drafts.get('chat-a')).toBe('Newer reply  ')
    expect(document.querySelector('textarea').value).toBe('Keep me')
    expect(document.querySelector('[role="alert"]').textContent).toContain('draft changed')
    document.querySelector('.afh-save').click();await flush()
    expect(attachment().data.annotations).toHaveLength(1)
    expect(state.drafts.get('chat-a').endsWith('\n\nNewer reply  ')).toBe(true)
  })
  it('rejects a draft changed during removal',async()=>{
    controller.edit(capture());await comment('Saved')
    const part=attachment(),original=state.drafts.get('chat-a'),read=sdk.composer.getDraft
    sdk.composer.getDraft=async session=>{
      const draft=await read(session)
      state.drafts.set(session,original+'New typing')
      return draft
    }
    const writes=state.writes
    await controller.remove('chat-a',part,null)
    expect(state.writes).toBe(writes)
    expect(state.drafts.get('chat-a')).toBe(original+'New typing')
    expect(state.notices.at(-1).message).toContain('draft changed')
  })
  it('rechecks ownership after the final draft read',async()=>{
    const read=sdk.composer.getDraft
    sdk.composer.getDraft=async session=>{
      const draft=await read(session)
      if(state.reads===2)state.session='chat-b'
      return draft
    }
    controller.edit(capture());await comment('Keep in A')
    expect(state.writes).toBe(0)
    expect(document.querySelector('[role="alert"]').textContent).toContain('chat changed')
  })
  it('Escape asks Resume or Discard when the comment has text, and closes an empty one',()=>{
    const esc=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    api.captureSelection=()=>capture('First passage');controller.offer();document.querySelector('.afh-add').click()
    esc()
    expect(controller.panel).toBeNull()
    expect(controller.pending.size).toBe(0)
    controller.edit(capture('First passage'));type('Typed work')
    esc()
    expect(controller.panel).not.toBeNull()
    expect(document.querySelector('.afh-footer').hidden).toBe(true)
    document.querySelector('[aria-label="Resume editing"]').click()
    expect(document.querySelector('.afh-confirm')).toBeNull()
    expect(document.querySelector('textarea').value).toBe('Typed work')
    esc();esc()
    expect(document.querySelector('.afh-confirm')).toBeNull()
    expect(document.querySelector('textarea').value).toBe('Typed work')
    esc();document.querySelector('[aria-label="Discard comment"]').click()
    expect(controller.panel).toBeNull()
    expect(controller.pending.size).toBe(0)
    api.captureSelection=()=>capture('Second passage');controller.offer();document.querySelector('.afh-add').click()
    expect(document.querySelector('.afh-quote').textContent).toBe('Second passage')
    expect(document.querySelector('textarea').value).toBe('')
    expect(document.querySelector('[role="alert"]').textContent).toBe('')
  })
  it('blocks only the same passage: identical text elsewhere is still allowed',async()=>{
    const host=document.createElement('div');host.innerHTML='<p>Same words here.</p><p>Same words here.</p>';document.body.append(host)
    const rangeOf=(index)=>{const r=document.createRange();const t=host.children[index].firstChild;r.setStart(t,0);r.setEnd(t,10);return r}
    controller.edit({...capture('Same words'),range:rangeOf(0)});await comment('First')
    controller.edit({...capture('Same words'),range:rangeOf(1)});await comment('Other passage')
    expect(attachment().data.annotations.map(a=>a.comment)).toEqual(['First','Other passage'])
    const before=state.drafts.get('chat-a')
    controller.edit({...capture('Same words'),range:rangeOf(0)});await comment('Again')
    expect(state.drafts.get('chat-a')).toBe(before)
    const save=document.querySelector('.afh-save')
    expect(save.textContent).toBe('Already added')
    expect(save.disabled).toBe(true)
    expect(document.querySelector('[role="alert"]').textContent).toBe('')
    expect(document.querySelector('.afh-hint').textContent).toBe('Esc closes')
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    expect(controller.panel).toBeNull()
    expect(controller.pending.size).toBe(0)
  })
  it('watches only passages that hold a highlight, never the whole document',async()=>{
    const observe=vi.spyOn(MutationObserver.prototype,'observe')
    const source=document.createElement('p');source.textContent='Selected passage';const wrap=document.createElement('section');wrap.append(source);document.body.append(wrap)
    const range=document.createRange();range.selectNodeContents(source.firstChild)
    controller.edit({...capture(),range});await comment('A comment')
    const targets=observe.mock.calls.map(call=>call[0])
    expect(targets).toContain(wrap)
    expect(targets).not.toContain(document.body)
    observe.mockRestore()
  })
  it('takes every colour from host theme tokens, with light-dark() fallbacks only',()=>{
    const text=controller.style.textContent
    for(const token of ['--ui-text-primary','--ui-text-secondary','--ui-stroke-secondary','--ui-accent','--ui-text-danger'])expect(text).toContain(`var(${token},light-dark(`)
    expect(text).toContain('--afh-bg:light-dark(#ffffff,#2c2c2e)')
    const bare=text.replace(/light-dark\([^()]*\)/g,'').replace(/color-mix\(in srgb,var\(--afh-accent\) 60%,#000\)/,'').replace(/var\(--ui-accent,#[0-9a-fA-F]+\)/g,'var(--ui-accent)').replace(/color:#fff/,'')
    expect(bare.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull()
  })
})
