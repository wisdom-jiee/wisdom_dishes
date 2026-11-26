const form=document.querySelector('#form'),list=document.querySelector('#list'),message=document.querySelector('#message');let editingId=null;const dialog=document.querySelector('#dishDialog'),formMessage=document.querySelector('#formMessage'),preview=document.querySelector('#photoPreview');
function resetForm(){form.reset();editingId=null;document.querySelector('#formTitle').textContent='添加菜品';document.querySelector('#save').textContent='添加菜品 ↗';formMessage.textContent='';preview.hidden=true;preview.removeAttribute('src');document.querySelector('#photoHint').textContent='添加菜品时请选择照片。';form.elements.namedItem('photo').required=true}
async function refresh(){const res=await fetch('/api/admin/dishes');if(!res.ok)throw Error('无法加载菜品');const dishes=await res.json();list.replaceChildren();document.querySelector('#manageCount').textContent=dishes.length;document.querySelector('#listEmpty').hidden=!!dishes.length;
 dishes.forEach(dish=>{const row=document.createElement('div');row.className='row';const img=document.createElement('img');img.src='/uploads/'+encodeURIComponent(dish.image);img.alt='';const title=document.createElement('span');title.className='row-name';title.textContent=dish.name;const edit=document.createElement('button');edit.type='button';edit.textContent='编辑';edit.onclick=()=>{resetForm();editingId=dish.id;form.elements.namedItem('name').value=dish.name;form.elements.namedItem('photo').required=false;document.querySelector('#formTitle').textContent='编辑菜品';document.querySelector('#save').textContent='保存修改 ↗';form.elements.namedItem('recipe').value=dish.recipe||'';form.elements.namedItem('ingredients_text').value=(dish.ingredients||[]).join('、');preview.src='/uploads/'+encodeURIComponent(dish.image);preview.hidden=false;document.querySelector('#photoHint').textContent='不选择新照片将保留原照片。';message.textContent='';dialog.showModal();form.elements.namedItem('name').focus()};const del=document.createElement('button');del.type='button';del.textContent='删除';del.onclick=async()=>{if(!confirm('确定删除“'+dish.name+'”吗？'))return;try{const r=await fetch('/api/dishes/'+encodeURIComponent(dish.id),{method:'DELETE'});if(!r.ok)throw Error();if(editingId===dish.id)resetForm();await refresh();message.textContent='菜品已删除。'}catch{message.textContent='删除失败，请重试。'}};row.dataset.id=dish.id;row.append(img,title,edit,del);list.append(row);addHandles()})}
document.querySelector('#addDish').onclick=()=>{resetForm();dialog.showModal();form.elements.namedItem('name').focus()};document.querySelector('#cancelEdit').onclick=()=>dialog.close();document.querySelector('#closeDialog').onclick=()=>dialog.close();
form.onsubmit=async e=>{e.preventDefault();formMessage.textContent='';document.querySelector('#save').disabled=true;const data=new FormData(form);const ingredients=String(data.get('ingredients_text')||'').split('、').map(value=>value.trim()).filter(Boolean);data.delete('ingredients_text');ingredients.forEach(value=>data.append('ingredients',value));if(editingId)data.set('id',editingId);try{const capability=await fetch('/api/capabilities',{cache:'no-store'});if(!capability.ok||!(await capability.json()).ingredients)throw Error('服务版本过旧，请重启本地服务后再保存。');const res=await fetch('/api/dishes',{method:'POST',body:data});const result=await res.json();if(!res.ok)throw Error(result.error||'保存失败');const wasEditing=!!editingId;dialog.close();resetForm();await refresh();message.textContent=wasEditing?'修改已保存。':'菜品已添加，可以继续添加。'}catch(err){formMessage.textContent=err.message||'连接失败，请确认本地服务正在运行。'}finally{document.querySelector('#save').disabled=false}};
let savingOrder=false;
function addHandles(){
 for(const row of list.children){
  if(row.querySelector('.drag-handle'))continue;
  const handle=document.createElement('button');handle.type='button';handle.className='drag-handle';handle.textContent='⠿';handle.setAttribute('aria-label','拖动排序，或使用上下方向键移动菜品');
  handle.addEventListener('pointerdown',startDrag);handle.addEventListener('keydown',moveWithKeyboard);row.prepend(handle);
 }
}
async function saveOrder(){
 if(savingOrder)return;savingOrder=true;
 try{const ids=Array.from(list.children,row=>row.dataset.id);const res=await fetch('/api/dishes/order',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(ids)});if(!res.ok)throw Error();message.textContent='菜品顺序已保存。'}
 catch{message.textContent='排序保存失败，已重新加载列表。';try{await refresh()}catch{message.textContent='排序保存失败，请刷新页面。'}}finally{savingOrder=false}
}
function startDrag(event){
 if(event.button!==0||savingOrder)return;
 event.preventDefault();
 const handle=event.currentTarget,row=handle.parentElement,startY=event.clientY,startX=event.clientX;
 const original=Array.from(list.children),initialTop=row.getBoundingClientRect().top;
 let active=false;
 const move=e=>{
  if(e.pointerId!==event.pointerId)return;
  if(!active){if(Math.hypot(e.clientX-startX,e.clientY-startY)<6)return;active=true;row.classList.add('dragging')}
  const rows=Array.from(list.children).filter(item=>item!==row);
  const center=initialTop+(e.clientY-startY)+row.offsetHeight/2;
  const target=rows.find(item=>{const rect=item.getBoundingClientRect();return center<rect.top+rect.height/2});
  if((target||null)!==row.nextElementSibling){
   const positions=new Map(rows.map(item=>[item,item.getBoundingClientRect().top]));
   list.insertBefore(row,target||null);
   for(const item of rows){const offset=positions.get(item)-item.getBoundingClientRect().top;if(offset)item.animate([{transform:'translateY('+offset+'px)'},{transform:'translateY(0)'}],{duration:180,easing:'ease'});}
  }
  const offset=initialTop+(e.clientY-startY)-(row.getBoundingClientRect().top-(parseFloat(row.dataset.dragOffset)||0));
  row.style.transform='translateY('+offset+'px)';
  row.dataset.dragOffset=String(offset);
 };
 const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);row.classList.remove('dragging');row.style.transform='';delete row.dataset.dragOffset};
 const finish=e=>{if(e.pointerId!==event.pointerId)return;cleanup();if(active&&original.some((item,i)=>list.children[i]!==item))saveOrder()};
 const cancel=e=>{if(e.pointerId!==undefined&&e.pointerId!==event.pointerId)return;cleanup();if(active)original.forEach(item=>list.append(item))};
 window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);
}
function moveWithKeyboard(event){if(savingOrder||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const row=event.currentTarget.parentElement,sibling=event.key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling;if(!sibling)return;list.insertBefore(row,event.key==='ArrowUp'?sibling:sibling.nextSibling);event.currentTarget.focus();saveOrder()}
resetForm();refresh().catch(()=>{message.textContent='无法加载菜单，请确认本地服务正在运行。'});
