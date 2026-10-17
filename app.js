App({onShow(options){
  const id=options&&options.query&&options.query.capsuleId;
  if(!id)return;
  const pages=getCurrentPages(),page=pages[pages.length-1];
  if(page&&typeof page.openReminderLink==='function')page.openReminderLink(id);
}});
