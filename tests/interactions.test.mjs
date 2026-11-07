import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest'
import {AnnotateController,readAttachments} from '../desktop/plugin.js'
import {createSdk} from './sdk.mjs'
let controller,sdk,state,api
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
const captured=text=>({text,session:'chat-a',anchor:{left:30,top:100,bottom:120}})
const save=async(text,comment='')=>{
  controller.edit(typeof text==='string'?captured(text):text)
  const input=document.querySelector('textarea');input.value=comment;input.dispatchEvent(new Event('input'))
  document.querySelector('[aria-label="Add to reply"]').click();await flush()
}
const part=()=>readAttachments(state.drafts.get('chat-a'),api)[0]
beforeEach(()=>{document.body.replaceChildren();({sdk,state,api}=createSdk());controller=new AnnotateController(sdk);controller.mount()})
afterEach(()=>{controller.dispose();vi.useRealTimers();vi.unstubAllGlobals()})
describe('compact annotation interactions',()=>{
  it('allows an empty optional comment and adds only a draft attachment',async()=>{
    controller.edit(captured('Keep this selection'))
    expect(document.querySelector('textarea').placeholder).toBe('Add an optional comment…')
    expect(document.querySelector('.afh-comment-bar [aria-label="Add to reply"]')).not.toBeNull()
    document.querySelector('[aria-label="Add to reply"]').click();await flush()
    expect(part().data.annotations[0]).toMatchObject({text:'Keep this selection',comment:''})
    expect(state.drafts.get('chat-a').endsWith('Existing reply  ')).toBe(true)
    expect(state.submits).toBe(0)
  })
  it('opens a hover preview without moving focus and allows crossing into its controls',async()=>{
    await save('First','A comment');vi.useFakeTimers()
    const typing=document.createElement('textarea');document.body.append(typing);typing.focus()
    await controller.open({value:part().value,editable:true,interaction:'hover'})
    expect(document.activeElement).toBe(typing)
    expect(controller.panel.textContent).toContain('Selected text:')
    expect(controller.panel.textContent).toContain('User comment:')
    await controller.open({value:part().value,editable:true,interaction:'leave'})
    vi.advanceTimersByTime(200)
    controller.panel.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(400)
    expect(controller.panel).not.toBeNull()
    document.querySelector('[aria-label="Edit annotation 1"]').click()
    expect(controller.panel.querySelector('textarea').value).toBe('A comment')
    expect(document.activeElement).toBe(controller.panel.querySelector('textarea'))
  })
  it('dismisses a passive preview on exit but leaves a clicked review open',async()=>{
    await save('First');vi.useFakeTimers()
    await controller.open({value:part().value,editable:true,interaction:'hover'})
    await controller.open({value:part().value,editable:true,interaction:'leave'})
    vi.advanceTimersByTime(400);expect(controller.panel).toBeNull()
    await controller.open({value:part().value,editable:true})
    await controller.open({value:part().value,editable:true,interaction:'leave'})
    vi.advanceTimersByTime(400);expect(controller.panel).not.toBeNull()
  })
  it('does not replace an unfinished comment with an incidental hover preview',async()=>{
    await save('First')
    controller.edit(captured('Second'))
    const input=document.querySelector('textarea');input.value='Still typing';input.dispatchEvent(new Event('input'))
    await controller.open({value:part().value,editable:true,interaction:'hover'})
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('Still typing')
    expect(controller.panel.getAttribute('aria-label')).toBe('Add annotation')
  })
  it('does not resurrect a preview whose async draft read finished after dismissal',async()=>{
    await save('First');const value=part().value
    let finish;sdk.composer.getDraft=()=>new Promise(resolve=>{finish=resolve})
    const opening=controller.open({value,editable:true,interaction:'hover'})
    controller.close(false);finish(state.drafts.get('chat-a'));await opening
    expect(controller.panel).toBeNull()
  })
  it('opens a keyboard preview without stealing focus and keeps sent previews read only',async()=>{
    await save('First','Optional feedback')
    const chip=document.createElement('button');document.body.append(chip);chip.focus()
    await controller.open({value:part().value,editable:false,interaction:'focus'})
    expect(document.activeElement).toBe(chip)
    expect(controller.panel.textContent).toContain('Optional feedback')
    expect(controller.panel.querySelector('[aria-label^="Edit annotation"]')).toBeNull()
    expect(controller.panel.querySelector('[aria-label^="Remove annotation"]')).toBeNull()
  })
  it('numbers tracked passages, repositions markers, and renumbers after removal',async()=>{
    const section=document.createElement('section');document.body.append(section)
    let right=180
    for(let i=1;i<=2;i++){
      const p=document.createElement('p');p.textContent='Passage '+i;section.append(p)
      const range=document.createRange();range.selectNodeContents(p.firstChild)
      range.getClientRects=()=>[{left:30,right,top:100,bottom:120}]
      await save({...captured(p.textContent),range})
    }
    expect([...controller.markers.values()].map(m=>m.textContent)).toEqual(['1','2'])
    expect(new Set([...controller.markers.values()].map(m=>m.style.left)).size).toBe(2)
    right=260;window.dispatchEvent(new Event('resize'))
    expect([...controller.markers.values()][0].style.left).toBe('250px')
    const attachment=part();await controller.remove('chat-a',attachment,attachment.data.annotations[0].id)
    expect([...controller.markers.values()].map(m=>m.textContent)).toEqual(['1'])
    controller.dispose();expect(document.querySelector('[data-afh="marker"]')).toBeNull()
  })
  it('hides a marker when its passage scrolls behind a sticky overlay and restores it when exposed',async()=>{
    const p=document.createElement('p');p.textContent='Selected passage';document.body.append(p)
    const overlay=document.createElement('aside');document.body.append(overlay)
    const range=document.createRange();range.selectNodeContents(p)
    range.getClientRects=()=>[{left:30,right:180,top:100,bottom:120}]
    let covered=false
    const hit=vi.fn(()=>covered?[overlay,p,document.body]:[p,document.body])
    Object.defineProperty(document,'elementsFromPoint',{configurable:true,value:hit})
    try {
      await save({...captured(p.textContent),range})
      const marker=[...controller.markers.values()][0]
      expect(marker.hidden).toBe(false)
      covered=true;document.dispatchEvent(new Event('scroll'))
      expect(marker.hidden).toBe(true)
      expect(part().data.annotations).toHaveLength(1)
      covered=false;document.dispatchEvent(new Event('scroll'))
      expect(marker.hidden).toBe(false)
    } finally {delete document.elementsFromPoint}
  })
  it('hides existing markers when a collapsed or unrendered range has no geometry',async()=>{
    const p=document.createElement('p');p.textContent='Selected passage';document.body.append(p)
    const range=document.createRange();range.selectNodeContents(p)
    let rects=[{left:30,right:180,top:100,bottom:120}]
    range.getClientRects=()=>rects
    await save({...captured(p.textContent),range})
    const marker=[...controller.markers.values()][0]
    expect(marker.hidden).toBe(false)
    rects=[];controller.positionMarkers()
    expect(marker.hidden).toBe(true)
  })
  it('keeps off-screen markers out of the visible collision layout',async()=>{
    for(const top of [-20,10]){
      const p=document.createElement('p');p.textContent='Passage '+top;document.body.append(p)
      const range=document.createRange();range.selectNodeContents(p)
      range.getClientRects=()=>[{left:30,right:180,top,bottom:top+15}]
      await save({...captured(p.textContent),range})
    }
    const [hidden,visible]=[...controller.markers.values()]
    expect(hidden.hidden).toBe(true)
    expect(visible.hidden).toBe(false)
    expect(visible.style.left).toBe('170px')
  })
})

describe('dictation comments',()=>{
  function installVoice(){
    let recipient
    const handle={stop:vi.fn(),cancel:vi.fn()}
    sdk.composer.dictation={version:1,start:vi.fn((session,callbacks)=>{recipient=callbacks;callbacks.onState('starting');return handle})}
    controller.edit(captured('Selected passage'))
    return {handle,get recipient(){return recipient},mic:document.querySelector('.afh-dictate'),input:document.querySelector('textarea')}
  }
  it('dictates at the comment caret without changing or submitting the chat draft',async()=>{
    const voice=installVoice();voice.input.value='Please simplify.';voice.input.setSelectionRange(7,15)
    voice.mic.click();expect(voice.input.readOnly).toBe(true)
    voice.recipient.onState('recording');voice.mic.click();expect(voice.handle.stop).toHaveBeenCalledOnce()
    voice.recipient.onState('transcribing');expect(voice.mic.disabled).toBe(true)
    voice.recipient.onTranscript('shorten this');voice.recipient.onState('idle')
    expect(voice.input.value).toBe('Please shorten this.')
    expect(voice.input.readOnly).toBe(false)
    expect(state.writes).toBe(0);expect(state.submits).toBe(0)
    document.querySelector('[aria-label="Add to reply"]').click();await flush()
    expect(part().data.annotations[0].comment).toBe('Please shorten this.')
  })
  it('cancels capture on close and ignores late text after a different editor opens',()=>{
    const voice=installVoice();voice.mic.click();controller.close(false)
    expect(voice.handle.cancel).toHaveBeenCalledOnce()
    controller.edit(captured('Other selection'))
    voice.recipient.onTranscript('Late private text');voice.recipient.onState('idle')
    expect(document.querySelector('textarea').value).toBe('')
    expect(state.writes).toBe(0)
  })
  it('uses Escape to cancel only the recording, preserving the typed comment',()=>{
    const voice=installVoice();voice.input.value='Keep this';voice.input.dispatchEvent(new Event('input'));voice.mic.click()
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    expect(voice.handle.cancel).toHaveBeenCalledOnce()
    expect(voice.input.isConnected).toBe(true);expect(voice.input.value).toBe('Keep this')
    voice.recipient.onTranscript('Cancelled take');expect(voice.input.value).toBe('Keep this')
  })
  it('fails visibly and leaves typing available when the host cannot claim dictation',()=>{
    sdk.composer.dictation={version:1,start:()=>null};controller.edit(captured('Selection'))
    document.querySelector('.afh-dictate').click()
    expect(document.querySelector('[role="alert"]').textContent).toContain('unavailable')
    expect(document.querySelector('textarea').readOnly).toBe(false)
  })
  it('retains a paragraph marker when rendered selection includes a trailing newline',async()=>{
    const p=document.createElement('p');p.textContent='Paragraph';document.body.append(p)
    const range=document.createRange();range.selectNodeContents(p)
    range.getClientRects=()=>[{left:30,right:180,top:100,bottom:120}]
    await save({...captured('Paragraph\n'),range})
    expect(controller.markers.size).toBe(1)
    p.firstChild.textContent='Changed paragraph';controller.refreshHighlights()
    expect(controller.markers.size).toBe(0)
  })
})

describe('large annotation batches',()=>{
  it('stages the thousandth annotation and reviews/removes it without losing any other entries',async()=>{
    const many=Array.from({length:999},(_,i)=>({id:String(i),text:`Passage ${i}`,comment:`Comment ${i}`}))
    state.drafts.set('chat-a',api.format({type:'response-annotations',version:1,label:'999 annotations',annotations:many})+'\n\nExisting reply  ')
    await save('Thousandth passage','Last comment')
    expect(part().data.annotations).toHaveLength(1000)
    await controller.open({value:part().value,editable:true})
    expect(document.querySelectorAll('.afh-item')).toHaveLength(1000)
    document.querySelector('[aria-label="Remove annotation 1000"]').click();await flush()
    expect(part().data.annotations).toEqual(many)
    expect(state.drafts.get('chat-a').endsWith('Existing reply  ')).toBe(true)
    expect(state.submits).toBe(0)
  })
})
