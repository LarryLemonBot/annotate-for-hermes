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
    expect(css('.afh-surface').boxShadow).toBe('0 1px 3px #00000012,0 4px 16px #0000001f')
    const luminance=(rgb,brightness=1)=>rgb.match(/\d+/g).map(value=>Number(value)*brightness/255)
      .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
      .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0)
    const save=css('[data-afh] .afh-save')
    for(const brightness of [1,.94])expect((luminance(save.color,brightness)+.05)/(luminance(save.background,brightness)+.05)).toBeGreaterThanOrEqual(4.5)
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
    expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toContain('Esc to close')
    expect(document.querySelector('.afh-save').textContent).toBe('Add')
    expect(document.querySelector('.afh-save svg')).toBeNull()
    await comment('Saved')
    await controller.open({value:attachment().value,editable:true})
    document.querySelector('[aria-label="Edit annotation 1"]').click()
    expect(document.querySelector('.afh-save').textContent).toBe('Save')
    type('Unfinished edit')
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    expect(controller.panel).toBeNull()
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
  it('restores an unfinished selection with an explanation instead of replacing it',()=>{
    controller.edit(capture('First passage'));type('Keep this comment');controller.close(false)
    api.captureSelection=()=>capture('Second passage');controller.offer()
    document.querySelector('.afh-add').click()
    expect(document.querySelector('.afh-quote').textContent).toBe('First passage')
    expect(document.querySelector('textarea').value).toBe('Keep this comment')
    expect(document.querySelector('[role="alert"]').textContent).toContain('unfinished comment was restored')
    document.querySelector('[aria-label="Cancel annotation"]').click()
    controller.edit(capture('Second passage'))
    expect(document.querySelector('.afh-quote').textContent).toBe('Second passage')
    expect(document.querySelector('textarea').value).toBe('')
  })
  it('preserves an unfinished comment when editing a different saved annotation',async()=>{
    controller.edit(capture('Saved passage'));await comment('Saved comment')
    controller.edit(capture('Unfinished passage'));type('Keep me')
    await controller.open({value:attachment().value,editable:true})
    document.querySelector('[aria-label="Edit annotation 1"]').click()
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
})
