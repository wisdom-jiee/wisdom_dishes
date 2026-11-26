const journey=document.querySelector('#journey'),book=document.querySelector('#book'),cover=document.querySelector('#cover'),left=document.querySelector('#leftPage'),right=document.querySelector('#rightPage'),leaves=document.querySelector('#leaves'),label=document.querySelector('#stageLabel'),title=document.querySelector('#stageTitle'),counter=document.querySelector('#pageCounter'),prev=document.querySelector('#prev'),next=document.querySelector('#next');
 let spreads=[], progress=0, current=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const detail=document.querySelector('#dishDetail');
let detailRequest=0;
async function showDish(dish){
 const request=++detailRequest,recipe=document.querySelector('#detailRecipe');
 document.querySelector('#detailImage').src='/uploads/'+encodeURIComponent(dish.image);document.querySelector('#detailImage').alt=dish.name;document.querySelector('#detailName').textContent=dish.name;document.querySelector('#detailNumber').textContent='NO. '+String(dish.index+1).padStart(2,'0');
 const ingredients=document.querySelector('#detailIngredients');ingredients.replaceChildren(node('li','ingredient-placeholder','正在读取材料…'));recipe.textContent='正在读取做法…';detail.showModal();document.documentElement.classList.add('dish-detail-open');
 try{const response=await fetch('/api/admin/dishes',{cache:'no-store'});if(!response.ok)throw Error();const dishes=await response.json();const latest=dishes.find(item=>item.id===dish.id);if(!latest||!Object.hasOwn(latest,'recipe'))throw Error();if(request===detailRequest&&detail.open){recipe.textContent=latest.recipe?.trim()||'这道菜的做法还在整理中。';if(!Array.isArray(latest.ingredients)){ingredients.replaceChildren(node('li','ingredient-placeholder','服务版本过旧，请重启本地服务。'))}else{const names=latest.ingredients;ingredients.replaceChildren(...(names.length?names.map(name=>node('li','',name)):[node('li','ingredient-placeholder','暂未填写材料')]))}}}
 catch{if(request===detailRequest&&detail.open){recipe.textContent='做法暂时无法读取，请刷新页面后重试。';ingredients.replaceChildren(node('li','ingredient-placeholder','材料暂时无法读取'))}}
}
document.querySelector('.detail-close').addEventListener('click',()=>detail.close());
detail.addEventListener('close',()=>document.documentElement.classList.remove('dish-detail-open'));
detail.addEventListener('click',e=>{if(e.target===detail)detail.close()});
function makePage(items,pageNumber,side){
 const page=node('div','page-content');const head=node('div','page-heading');head.append(node('span','','MAISON · 家宴'),node('span','',String(pageNumber).padStart(2,'0')));page.append(head);
 const list=node('div','page-dishes');
 if(!items.length){const empty=node('div','page-empty');empty.append(node('span','','✳'),node('p','',side==='left'?'好食光，共此刻。':'更多美味，敬请期待。'));list.append(empty)}
 items.forEach(dish=>{const item=node('button','dish');item.type='button';item.setAttribute('aria-label','查看'+dish.name+'的做法');item.addEventListener('click',()=>showDish(dish));const photo=node('div','dish-photo');const img=node('img');img.src='/uploads/'+encodeURIComponent(dish.image);img.alt='';img.loading=pageNumber<=2?'eager':'lazy';photo.append(img);const meta=node('div','dish-meta');meta.append(node('span','dish-name',dish.name),node('span','dish-index',String(dish.index+1).padStart(2,'0')));item.append(photo,meta);list.append(item)});page.append(list);
 const foot=node('div','page-footer');foot.append(node('span','','A TABLE MADE FOR YOU'),node('span','','✳'));page.append(foot);return page;
}
function render(){
 const mobile=matchMedia('(max-width: 700px)').matches;
 const sheets=[];for(let i=0;i<spreads.length;i+=2)sheets.push(spreads.slice(i,i+2));if(!sheets.length)sheets.push([]);
 const pages=mobile?sheets.map(right=>({left:[],right})):Array.from({length:1+Math.ceil((sheets.length-1)/2)},(_,i)=>({left:i?sheets[i*2-1]||[]:[],right:sheets[i*2]||[]}));
 book.classList.toggle('mobile-book',mobile);left.replaceChildren();right.replaceChildren();leaves.replaceChildren();
 right.append(makePage(pages[0].right,1,'right'));
 const inside=cover.querySelector('.cover-inside');
 inside.replaceChildren(node('span','','家宴'),node('p','','A TABLE MADE FOR YOU'));inside.classList.remove('cover-inside-page');
 for(let i=1;i<pages.length;i++){const leaf=node('div','turning-leaf');const front=node('div','leaf-face leaf-front'),back=node('div','leaf-face leaf-back');front.append(makePage(pages[i-1].right,mobile?i:i*2-1,'right'));back.append(makePage(mobile?pages[i].right:pages[i].left,mobile?i+1:i*2,'left'));leaf.append(front,back);leaf.dataset.index=i;leaves.append(leaf)}
 // The right-hand page beneath each turning leaf changes with the current spread.
 book.dataset.pages=pages.length;book._pages=pages;book._mobile=mobile;
 journey.style.height=(pages.length+1)*100+'vh';update();
}
function update(){
 const distance=Math.max(1,journey.offsetHeight-innerHeight);progress=Math.max(0,Math.min(1,-journey.getBoundingClientRect().top/distance));const n=book._pages?.length||1;const t=progress*n;const open=Math.min(1,t);const opened=t>=0.99;
 book.style.setProperty('--opening',open);book.classList.toggle('is-open',open>=1);cover.style.transform='rotateY('+(-180*open)+'deg)';cover.style.visibility=open>=1?'hidden':'visible';
 left.style.visibility=open>=1&&!book._mobile?'visible':'hidden';
 const phase=Math.max(0,t-1),spread=Math.max(0,Math.min(n-1,Math.floor(phase+0.00001)));
 const turn=phase-spread,turning=spread<n-1&&turn>0.00001;
 Array.from(leaves.children).forEach((leaf,i)=>{
  const active=turning&&i===spread;
  leaf.style.visibility=active?'visible':'hidden';
  leaf.children[0].inert=!active||turn>=.5;
  leaf.children[1].inert=!active||turn<.5;
  if(active)leaf.style.transform='rotateY('+(-180*turn)+'deg)';
 });
 const rightIndex=turning?spread+1:spread;
 const viewKey=spread+':'+rightIndex;
 if(viewKey!==current||right.childElementCount===0){current=viewKey;const leftItems=book._pages[spread].left,rightItems=book._pages[rightIndex].right;if(spread===0&&!book._mobile){const lining=cover.querySelector('.cover-inside').cloneNode(true);lining.className='cover-lining';left.replaceChildren(lining)}else left.replaceChildren(makePage(leftItems,spread*2,'left'));right.replaceChildren(makePage(rightItems,book._mobile?rightIndex+1:rightIndex*2+1,'right'))}
 const index=opened?Math.min(n-1,Math.round(Math.max(0,t-1))):-1;counter.textContent=index<0?'封面':String(index+1).padStart(2,'0')+' / '+String(n).padStart(2,'0');label.textContent=index<0?'THE BEGINNING':'THE COLLECTION';title.textContent=index<0?'一席家宴，邀你入座。':'用心之作，请慢慢品味。';prev.disabled=progress<.01;next.disabled=progress>.99;
}
function go(delta){const n=book._pages.length;const t=progress*n;const target=delta>0?Math.min(n,Math.floor(t+.05)+1):Math.max(0,Math.ceil(t-.05)-1);const top=window.scrollY+journey.getBoundingClientRect().top+(target/n)*(journey.offsetHeight-innerHeight);window.scrollTo({top,behavior:reduced.matches?'instant':'smooth'})}
prev.onclick=()=>go(-1);next.onclick=()=>go(1);window.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{current=-1;render()},150)});
fetch('/api/dishes').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{spreads=data.map((dish,index)=>({...dish,index}));current=-1;render()}).catch(()=>{title.textContent='菜单暂时无法加载，请检查本地服务。';spreads=[];current=-1;render()});
