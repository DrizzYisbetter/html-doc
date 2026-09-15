// Aside REPL: run against the skill served on http://127.0.0.1:8769.
// Responsive iframe tests, including a short viewport. Real iOS keyboard is not simulated.
const url='http://127.0.0.1:8769/examples/demo.html';
const found=(await listBrowserTabs()).find(t=>t.url===url);
if(found)await attachBrowserTab(found.targetId);else await openTab(url);
console.log((await snapshot(page,{selector:'#doc-controls'})).tree);
const result=await page.evaluate(async()=>{
 const source=await(await fetch(location.href)).text(),results=[];
 const check=(name,ok,details)=>{results.push({name,pass:!!ok,...details});};
 for(const [width,height] of [[320,640],[375,812],[390,844],[430,932],[768,1024],[844,390],[390,360],[1280,900]]){
  const f=document.createElement('iframe');f.id='qa-mobile';f.style.cssText=`position:fixed;left:0;top:0;width:${width}px;height:${height}px;z-index:2147483647;background:white;border:0`;
  const loaded=new Promise(r=>f.onload=r);f.srcdoc=source.replace('<body>',`<body data-doc-id="qa-mobile-${width}-${height}">`);document.body.appendChild(f);await loaded;
  const w=f.contentWindow,d=w.document,ed=w.DocEditor;
  const settle=()=>new Promise(r=>w.requestAnimationFrame(()=>w.requestAnimationFrame(r)));
  const shown=id=>w.getComputedStyle(d.getElementById(id)).display!=='none';
  const rect=id=>d.getElementById(id).getBoundingClientRect();
  await settle();const original=d.getElementById('doc-content').innerHTML;
  check(`${width}x${height}: view page fits`,d.documentElement.scrollWidth<=w.innerWidth+1,{pageWidth:d.documentElement.scrollWidth,viewport:w.innerWidth});
  d.getElementById('doc-editToggle').click();await settle();
  const controls=rect('doc-controls'),bar=rect('doc-editbar'),bodyTop=parseFloat(d.body.style.paddingTop);
  check(`${width}x${height}: edit page fits`,d.documentElement.scrollWidth<=w.innerWidth+1);
  if(width<=900){
   check(`${width}x${height}: two rows do not overlap`,bar.top>=controls.bottom-1 && bar.height<80 && bodyTop>=bar.bottom-1,{controlsHeight:controls.height,toolbarHeight:bar.height,bodyTop});
   check(`${width}x${height}: inspector starts collapsed`,!shown('doc-inspector'));
   check(`${width}x${height}: controls are touch sized`,['doc-editToggle','doc-saveBtn','doc-moreToggle','doc-inspectorToggle'].every(id=>rect(id).height>=44));
   const toolbar=d.getElementById('doc-editbar');toolbar.scrollLeft=toolbar.scrollWidth;await settle();
   check(`${width}x${height}: toolbar scroll exposes final tool`,toolbar.scrollLeft>0 && d.getElementById('doc-ebBlockDel').getBoundingClientRect().right<=w.innerWidth+1);
   d.getElementById('doc-inspectorToggle').click();await settle();const panel=rect('doc-inspector');
   check(`${width}x${height}: expanded inspector fits`,shown('doc-inspector') && panel.left>=0 && panel.right<=w.innerWidth && panel.top>=bar.bottom && panel.bottom<=w.innerHeight+1);
   d.getElementById('doc-inspectorClose').click();check(`${width}x${height}: inspector closes`,!shown('doc-inspector'));
   d.getElementById('doc-moreToggle').click();await settle();
   check(`${width}x${height}: extra actions accessible`,shown('doc-more-actions') && rect('doc-more-actions').right<=w.innerWidth && rect('doc-more-actions').bottom<=w.innerHeight+1);
   d.getElementById('doc-historyBtn').click();await settle();
   check(`${width}x${height}: history fits`,shown('doc-history-modal') && rect('doc-history-modal').width<=w.innerWidth && d.querySelector('.doc-ed-modal-card').getBoundingClientRect().height<=w.innerHeight);
   d.getElementById('doc-hist-close').click();
   d.getElementById('doc-inspectorToggle').click();
  }else{
   const tools=[...d.querySelectorAll('#doc-editbar .doc-ed-g')].map(el=>el.getBoundingClientRect());
   check('desktop: controls and toolbar do not overlap',tools.every(r=>r.right<=controls.left || r.top>=controls.bottom));
   check('desktop: inspector visible below toolbar',shown('doc-inspector') && rect('doc-inspector').top>=bar.bottom);
  }
  const clean=new DOMParser().parseFromString(ed.getHTML(),'text/html');
  check(`${width}x${height}: serialized UI closes`,!clean.body.classList.contains('doc-inspector-open') && !clean.body.classList.contains('doc-editing') && clean.querySelector('#doc-moreToggle').getAttribute('aria-expanded')==='false' && !clean.body.style.getPropertyValue('--doc-ed-tools-bottom') && !clean.body.classList.contains('doc-notes-open') && !clean.body.classList.contains('doc-changes'));
  ed.edit(false);await settle();
  check(`${width}x${height}: body unchanged after toggles`,d.getElementById('doc-content').innerHTML===original && d.body.style.paddingTop==='' && !shown('doc-editbar'));
  if(width===390 && height===844){
   ed.edit(true);
   const p=d.querySelector('.walk-lede'),range=d.createRange(),selection=w.getSelection();
   range.selectNodeContents(p);selection.removeAllRanges();selection.addRange(range);d.dispatchEvent(new w.Event('selectionchange'));
   d.querySelector('[data-cmd="bold"]').click();
   check('mobile: selected text can be bold',!!p.querySelector('b,strong,[style*="font-weight"]'));
   const size=d.getElementById('doc-ebSize');size.value='24';size.dispatchEvent(new w.Event('change'));
   check('mobile: font size applies',!!p.querySelector('[style*="font-size: 24px"]'));
   const color=d.getElementById('doc-ebColor');color.value='#cc3322';color.dispatchEvent(new w.Event('input'));
   check('mobile: color applies',p.innerHTML.includes('rgb(204, 51, 34)'));
   range.selectNodeContents(p);range.collapse(false);selection.removeAllRanges();selection.addRange(range);d.dispatchEvent(new w.Event('selectionchange'));
   d.getElementById('doc-ebTable').click();
   check('mobile: table inserts',!!d.querySelector('#doc-content table.doc-ed-table'));
   ed.edit(false);w.localStorage.removeItem('docedit:autosave:qa-mobile-390-844');
  }
  f.remove();
 }
 return {pass:results.every(r=>r.pass),count:results.length,failures:results.filter(r=>!r.pass),results};
});
console.log(JSON.stringify(result));
if(!result.pass)throw new Error('Mobile layout regression');
console.log((await snapshot(page,{selector:'#doc-controls'})).diff);
