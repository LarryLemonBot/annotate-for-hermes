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
afterEach(()=>{controller.dispose();vi.useRealTimers()})
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
})
