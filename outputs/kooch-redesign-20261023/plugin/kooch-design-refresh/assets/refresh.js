(()=>{
 'use strict';
 document.querySelectorAll('.kr-next-form').forEach(form=>{
  const description=form.querySelector('.kr-choice-description');
  form.addEventListener('change',event=>{
   if(event.target.matches('input[name="next"]'))description.textContent=event.target.dataset.description;
  });
 });
 // On long guides, an explicit top action supplements existing table-of-contents navigation.
 const guide=document.querySelector('.visa-guide,.country-guide,.article-shell');
 if(guide){
  const button=document.createElement('button');button.type='button';button.className='kr-to-top';button.textContent='بالای صفحه';
  button.addEventListener('click',()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});const heading=document.querySelector('main h1,#main-content h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
  document.body.append(button);const update=()=>{button.hidden=window.scrollY<900;};update();window.addEventListener('scroll',update,{passive:true});
 }
})();
