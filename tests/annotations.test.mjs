import {describe,it,expect,beforeEach,afterEach} from 'vitest'
import {AnnotateController,readAttachments,replaceAttachment} from '../desktop/plugin.js'
import {createSdk} from './sdk.mjs'
let controller,state,api,sdk
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
const capture=(text='Selected passage')=>({text,session:state.session,anchor:{left:24,top:200,bottom:220}})
const comment=async text=>{const input=document.querySelector('textarea');input.value=text;input.dispatchEvent(new Event('input'));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush()}
const attachment=()=>readAttachments(state.drafts.get(state.session),api)[0]
beforeEach(()=>{document.body.innerHTML='';({sdk,state,api}=createSdk());controller=new AnnotateController(sdk);controller.mount()})
afterEach(()=>controller.dispose())
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
