const {drawAnswer,ANSWER_COUNT} = require('../../utils/answers');
const store = require('../../utils/store');
const {publicContent,createAnswerImage}=require('../../utils/answer-card');
const journey=require('../../utils/journey');
const reminders=require('../../utils/reminders');
const MOTION = {exit:110,listen:900,brandExit:200,sheetExit:230};
function readingLines(text,capacity) {
  const chars=Array.from(text);
  if(chars.length<=capacity) return text;
  const breaks=[];
  chars.forEach((char,index)=>{if(/[，；：]/.test(char)&&index>=3&&index+1<=capacity&&chars.length-index-1<=capacity)breaks.push(index+1);});
  let cut=breaks.length?breaks.sort((a,b)=>Math.abs(a-chars.length/2)-Math.abs(b-chars.length/2))[0]:Math.ceil(chars.length/Math.ceil(chars.length/capacity));
  while(cut<chars.length&&/[，。！？；：、”」）]/.test(chars[cut]))cut++;
  return chars.slice(0,cut).join('')+'\n'+readingLines(chars.slice(cut).join(''),capacity);
}
Page({
  data: {
    topInset:44, navHeight:44, tab:'ask', phase:'idle', category:'all',answerCount:ANSWER_COUNT,
    question:'', questionFocused:false, breathingText:'听听心里的声音', result:null,
    entries:[], visibleEntries:[], favoriteCount:0, filter:'all', search:'',
    sheet:'', detail:null, noteDraft:'', vibration:true, today:'', countLabel:'',
    saveFailed:false, sheetClosing:false, sceneLeaving:false, sceneDirection:'forward',sceneMotion:'navigate',
    resultFontSize:50, detailFontSize:44, resultDisplayText:'',detailDisplayText:'',filterChanging:false,
    notice:'',noticeClosing:false,noticeTone:'success',brandTransition:false,brandTransitionClosing:false,
    shareCardOpen:false,shareBusy:false,shareImagePath:'',shareError:false,shareSaving:false,canShareImage:false,
    intuitionChoices:journey.INTUITIONS,outcomeChoices:journey.OUTCOMES,responseChoices:journey.RESPONSES,
    intuitionDraft:'',outcomeDraft:'',capsules:[],capsuleCount:0,capsuleReadyCount:0,capsule:null,
    sealOpen:false,sealDraft:'',sealDate:'',minSealDate:'',maxSealDate:'',sealOrigin:'',remindersAvailable:false,sealRemind:false,reminderBusyId:'',
    pageActive:true,keyboardHeight:0,sheetAnchor:'',sealAnchor:'',layoutMode:'compact',reminderFlight:false
  },
  onLoad(options) {
    this._store = store.read();
    this._timers = [];
    this._shareRequest=0;this._disposed=false;
    this.enableForwarding();
    let canShareImage=false;
    try{canShareImage=typeof wx.showShareImageMenu==='function'&&!!wx.canIUse&&wx.canIUse('showShareImageMenu.object.needShowEntrance');}catch(error){}
    let topInset = 44, navHeight = 44;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const capsule = wx.getMenuButtonBoundingClientRect();
      topInset = info.statusBarHeight || 20;
      navHeight = capsule && capsule.height ? (capsule.top-topInset)*2+capsule.height : 44;
    } catch(error) { /* 老版本保留安全的导航高度 */ }
    const d = new Date();
    this.setData({topInset,navHeight,canShareImage,vibration:this._store.vibration,today:String(d.getMonth()+1).padStart(2,'0')+' / '+String(d.getDate()).padStart(2,'0')});
    this.syncEntries();
    this.updateViewport();
    this.setData({remindersAvailable:reminders.available()});
    if(options&&options.capsuleId)this.openReminderLink(options.capsuleId);
  },
  updateViewport(size) {
    let info={},capsule=null;
    try{info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();capsule=wx.getMenuButtonBoundingClientRect();}catch(error){}
    const width=size&&Number.isFinite(size.windowWidth)&&size.windowWidth>0?size.windowWidth:info.windowWidth||this._windowWidth||375;
    const topInset=Number.isFinite(info.statusBarHeight)?info.statusBarHeight:this.data.topInset;
    const navHeight=capsule&&capsule.height?Math.max(44,Math.min(64,(capsule.top-topInset)*2+capsule.height)):44;
    const changed=this._windowWidth&&Math.abs(width-this._windowWidth)>2;
    this._windowWidth=width;
    const patch={topInset,navHeight,layoutMode:width>=600?'wide':'compact'};
    if(changed){try{wx.hideKeyboard();}catch(error){}Object.assign(patch,{keyboardHeight:0,questionFocused:false,sheetAnchor:'',sealAnchor:''});}
    this.setData(patch);
  },
  onResize(e){if(!this._disposed)this.updateViewport(e&&e.size);},
  onUnload() { this._disposed=true;clearTimeout(this._reminderFlightTimer);this._reminderFlightTimer=null;this._shareRequest++;this.clearTimers(); clearTimeout(this._sceneTimer);clearTimeout(this._filterTimer);clearTimeout(this._noticeTimer);clearTimeout(this._noticeExitTimer);clearTimeout(this._brandExitTimer); },
  onShow() { this.setData({pageActive:true});this.enableForwarding();this.updateViewport();if(this._store){this.refreshTime();this.refreshReminders();} },
  enableForwarding() {
    if(typeof wx.showShareMenu!=='function')return;
    const fallback=()=>{try{wx.showShareMenu({});}catch(error){}};
    try{wx.showShareMenu({menus:['shareAppMessage','shareTimeline'],fail:fallback});}catch(error){fallback();}
  },
  onShareAppMessage() {
    // 普通转发只打开首页，固定封面避免微信截取正在编辑的私人内容。
    return {title:'答案回响｜心里有个疑问？听听另一种可能。',path:'/pages/index/index',imageUrl:'/assets/share.png'};
  },
  onShareTimeline() {
    return {title:'答案回响｜听听另一种可能。',query:'',imageUrl:'/assets/brand-mark.png'};
  },
  onHide() { this.finishReminderFlight();this.setData({pageActive:false,keyboardHeight:0});if(this.data.phase==='breathing') this.cancelListening(); },
  clearTimers() { (this._timers || []).forEach(clearTimeout); this._timers = []; },
  later(fn,delay) { this._timers.push(setTimeout(fn,delay)); },
  changeScene(patch,direction,commit) {
    if(this._sceneBusy) return false;
    this._sceneBusy=true;
    wx.hideKeyboard();
    const sceneMotion=patch.phase==='answer'?'reveal':patch.phase==='idle'?'return':'navigate';
    this.setData({sceneLeaving:true,sceneDirection:direction||'forward',sceneMotion,questionFocused:false});
    this._sceneTimer=setTimeout(()=>{
      this._sceneTimer=null;
      const extra=commit?commit():{};
      this.setData({...patch,...extra,sceneLeaving:false});
      this._sceneBusy=false;
    },MOTION.exit);
    return true;
  },
  notify(message,tone) {
    clearTimeout(this._noticeTimer);clearTimeout(this._noticeExitTimer);
    this.setData({notice:message,noticeTone:tone||'success',noticeClosing:false});
    this._noticeTimer=setTimeout(()=>{
      this.setData({noticeClosing:true});
      this._noticeExitTimer=setTimeout(()=>this.setData({notice:'',noticeClosing:false}),180);
    },1600);
  },
  buzz() { if (this.data.vibration) { try { wx.vibrateShort({type:'light',fail(){}}); } catch(error) {} } },
  persist(next) {
    try { store.write(next); this._store=next; this.syncEntries(); return true; }
    catch(error) { this.notify('保存没有完成，请稍后重试','error'); return false; }
  },
  syncEntries() {
    const entries = store.decorate(this._store.entries);
    this.setData({entries,favoriteCount:entries.filter(e=>e.favorite).length,countLabel:entries.length?String(entries.length).padStart(2,'0'):'00'});
    this.applyFilter();
    this.refreshTime();
  },
  refreshTime() {
    const now=Date.now(),capsules=(this._store.capsules||[]).map(item=>journey.capsuleSummary(item,now));
    this.setData({capsules,capsuleCount:capsules.length,capsuleReadyCount:capsules.filter(item=>item.ready&&!item.opened).length});
    if(this.data.sheet==='capsule'&&this.data.capsule&&now<this.data.capsule.unlockAt)this.setData({sheet:'capsules',capsule:null});
  },
  applyFilter() {
    const query = this.data.search.trim().toLowerCase();
    const list = this.data.entries.filter(e => (this.data.filter!=='favorites'||e.favorite) && (!query||(e.text+' '+e.question+' '+e.note+' '+e.outcomeLabel).toLowerCase().includes(query)));
    this.setData({visibleEntries:list});
  },
  toggleArchive() {
    if(this.data.phase==='breathing'||this.data.sheet||this.data.brandTransition) return;
    this.changeScene({tab:this.data.tab==='ask'?'echo':'ask'},this.data.tab==='ask'?'forward':'back');
  },
  onQuestion(e) { this.setData({question:e.detail.value}); },
  onQuestionFocus() { this.setData({questionFocused:true}); },
  onQuestionBlur() { this.setData({questionFocused:false}); },
  onKeyboardHeight(e) {
    const height=Math.max(0,Number(e.detail.height)||0);
    this.setData({keyboardHeight:height,sheetAnchor:height&&this.data.sheet==='detail'&&!this.data.sealOpen?'note-editor':'',sealAnchor:height&&this.data.sealOpen?'future-message-editor':''});
  },
  onSearch(e) { clearTimeout(this._filterTimer);this.setData({search:e.detail.value,filterChanging:false});this.applyFilter(); },
  clearSearch() { this.onSearch({detail:{value:''}}); },
  onFilter(e) {
    const filter=e.currentTarget.dataset.filter;
    if(filter===this.data.filter) return;
    clearTimeout(this._filterTimer);
    this.setData({filter,filterChanging:true});
    this._filterTimer=setTimeout(()=>{this.applyFilter();this.setData({filterChanging:false});},100);
  },
  beginListening() {
    if(this.data.phase==='breathing'||this._sceneBusy||this.data.brandTransition||this.data.sheet||this.data.sealOpen||this.data.shareCardOpen)return;
    wx.hideKeyboard();this.setData({sheet:'intuition',sheetClosing:false,intuitionDraft:'',questionFocused:false});
  },
  chooseIntuition(e) {
    if(this.data.sheet!=='intuition'||this.data.sheetClosing)return;
    const value=journey.choice(journey.INTUITIONS,e.currentTarget.dataset.value);
    this.setData({intuitionDraft:this.data.intuitionDraft===value?'':value});
  },
  listenWithIntuition(e) {
    if(this.data.sheet!=='intuition'||this.data.sheetClosing)return;
    const skip=e&&e.currentTarget&&e.currentTarget.dataset.skip;
    this._nextIntuition=skip?'':this.data.intuitionDraft;
    this.setData({sheet:'',intuitionDraft:''});this.startListening();
  },
  startListening() {
    if(this.data.phase==='breathing'||this._sceneBusy||this.data.brandTransition||this.data.sheet) return;
    wx.hideKeyboard(); this.buzz(); this.clearTimers();
    clearTimeout(this._brandExitTimer);
    this._pendingQuestion=this.data.question.trim();
    this._pendingIntuition=journey.choice(journey.INTUITIONS,this._nextIntuition);this._nextIntuition='';
    this.setData({phase:'breathing',questionFocused:false,breathingText:'让这个疑问，轻轻落下。',saveFailed:false,brandTransition:true,brandTransitionClosing:false});
    this.later(()=>this.revealAnswer(),MOTION.listen);
  },
  cancelListening() {
    if(this.data.phase!=='breathing') return;
    const phase=this._repeatingAnswer&&this.data.result?'answer':'idle';
    this.clearTimers();clearTimeout(this._sceneTimer);clearTimeout(this._brandExitTimer);this._sceneTimer=null;this._sceneBusy=false;this._pendingQuestion=null;this._pendingIntuition='';
    this._repeatingAnswer=false;this._unsavedEntry=null;
    this.setData({phase,sceneLeaving:false,sceneMotion:'return',brandTransition:false,brandTransitionClosing:false});
  },
  revealAnswer() {
    const recent = this._store.entries.slice(0,8).reverse().map(e=>e.answerId);
    const answer = drawAnswer(this.data.category,recent);
    const stamp = Date.now();
    const entry = {id:'e'+stamp+'-'+Math.random().toString(36).slice(2,7),answerId:answer.id,category:answer.category,label:answer.label,text:answer.text,reflection:answer.reflection,question:this._pendingQuestion==null?this.data.question.trim():this._pendingQuestion,createdAt:stamp,favorite:false,note:'',intuition:this._pendingIntuition||'',response:'',outcome:''};
    this._unsavedEntry=entry;
    const fontSize=answer.text.length>18?44:50;
    this.changeScene({phase:'answer',result:store.decorate([entry])[0],resultFontSize:fontSize,resultDisplayText:readingLines(answer.text,Math.floor(510/fontSize))},'forward',()=>{
      const saved=this.persist({...this._store,entries:[entry,...this._store.entries].slice(0,200)});
      const brandTransitionClosing=this.data.brandTransition;
      if(brandTransitionClosing) this._brandExitTimer=setTimeout(()=>this.setData({brandTransition:false,brandTransitionClosing:false}),MOTION.brandExit);
      this._pendingQuestion=null;this._pendingIntuition='';this._repeatingAnswer=false;if(saved)this._unsavedEntry=null;this.buzz();return {saveFailed:!saved,brandTransitionClosing};
    });
  },
  retrySave() {
    const entry = {...(this._unsavedEntry||this.data.result)}; delete entry.date;
    if(this._store.entries.some(e=>e.id===entry.id)) { this.setData({saveFailed:false}); return; }
    if(this.persist({...this._store,entries:[entry,...this._store.entries].slice(0,200)})){this._unsavedEntry=null;this.setData({saveFailed:false});}
  },
  toggleFavorite(e) {
    const id = e.currentTarget.dataset.id;
    const target = this._store.entries.find(item=>item.id===id);
    if(!target) { this.notify('请先保存这次回响','error'); return; }
    const favorite=!target.favorite;
    if(!this.persist({...this._store,entries:this._store.entries.map(item=>item.id===id?{...item,favorite}:item)})) return;
    if(this.data.result&&this.data.result.id===id) this.setData({'result.favorite':favorite});
    if(this.data.detail&&this.data.detail.id===id) this.setData({'detail.favorite':favorite});
    this.buzz();
    this.notify(favorite?'已收藏这句回响':'已取消收藏');
  },
  answerActionReady() {
    if(this._disposed||!this.data.pageActive||this.data.tab!=='ask'||this.data.phase!=='answer'||this._sceneBusy||this.data.brandTransition||this.data.sheet||this.data.sealOpen||this.data.shareCardOpen||this.data.reminderFlight)return false;
    // 保存失败时先重试，不能在重新抽取或返回时覆盖尚未保存的回响。
    if(this.data.saveFailed){this.retrySave();if(this.data.saveFailed)return false;}
    return true;
  },
  anotherQuestion() {
    if(!this.answerActionReady()||!this.data.result)return;
    this._repeatingAnswer=true;this._nextIntuition='';
    if(typeof this.data.result.question==='string')this.setData({question:this.data.result.question});
    this.startListening();
  },
  returnHome() {
    if(!this.answerActionReady())return;
    this._repeatingAnswer=false;
    this.changeScene({tab:'ask',phase:'idle',result:null,resultDisplayText:'',saveFailed:false,intuitionDraft:''},'back');
  },
  chooseResponse(e) {
    if(this._sceneBusy||this.data.brandTransition||!this.data.result)return;
    const target=this._store.entries.find(item=>item.id===this.data.result.id);
    if(!target){this.notify('请先保存这次回响','error');return;}
    const value=journey.choice(journey.RESPONSES,e.currentTarget.dataset.value),response=target.response===value?'':value;
    if(this.persist({...this._store,entries:this._store.entries.map(item=>item.id===target.id?{...item,response}:item)}))this.setData({'result.response':response,'result.responseLabel':journey.label(journey.RESPONSES,response)});
  },
  openEntry(e) {
    if(this.data.sheet||this._sceneBusy) return;
    const detail = this.data.entries.find(item=>item.id===e.currentTarget.dataset.id);
    if(detail) {
      const fontSize=detail.text.length>18?40:44;
      this.setData({sheet:'detail',sheetClosing:false,detail,noteDraft:detail.note||'',outcomeDraft:detail.outcome||'',detailFontSize:fontSize,detailDisplayText:readingLines(detail.text,Math.floor(660/fontSize))});
    }
  },
  openAbout() { if(!this.data.sheet&&!this._sceneBusy)this.setData({sheet:'about',sheetClosing:false}); },
  dismissSheet() {
    if(this.data.sheetClosing) return;
    wx.hideKeyboard();
    this.setData({sheetClosing:true});
    this.later(()=>this.setData({sheet:'',sheetClosing:false,keyboardHeight:0,capsule:null}),MOTION.sheetExit);
  },
  closeSheet() {
    if(this.data.sheetClosing) return;
    if(this.data.sealOpen||this.data.shareCardOpen)return;
    if(this.data.sheet==='detail' && (this.data.noteDraft!==(this.data.detail.note||'')||this.data.outcomeDraft!==(this.data.detail.outcome||''))) {
      wx.showModal({title:'这段后来还没有保存',content:'要先保存回信和现在的进展吗？',confirmText:'保存',cancelText:'暂不保存',success:r=>{if(this._disposed)return;if(r.confirm) this.saveNote(); else if(r.cancel) this.dismissSheet();}});
      return;
    }
    this.dismissSheet();
  },
  stopPropagation() {},
  onNote(e) { this.setData({noteDraft:e.detail.value}); },
  chooseOutcome(e) {if(this.data.sheet!=='detail'||this.data.sheetClosing)return;const value=journey.choice(journey.OUTCOMES,e.currentTarget.dataset.value);this.setData({outcomeDraft:this.data.outcomeDraft===value?'':value});},
  saveNote() {
    if(this.data.sheet!=='detail'||this.data.sheetClosing)return;
    const id=this.data.detail.id,note=this.data.noteDraft.trim(),outcome=journey.choice(journey.OUTCOMES,this.data.outcomeDraft);
    if(!this._store.entries.some(e=>e.id===id)){this.notify('这次回响已经不在记录里','error');return;}
    if(this.persist({...this._store,entries:this._store.entries.map(e=>e.id===id?{...e,note,outcome}:e)})) {
      this.setData({'detail.note':note,'detail.outcome':outcome,noteDraft:note,outcomeDraft:outcome});
      if(this.data.result&&this.data.result.id===id)this.setData({'result.outcome':outcome});
      this.dismissSheet();
      this.notify(outcome?'这段后来已留好':note?'回信已留好':'回信已更新');
    }
  },
  deleteEntry() {
    const id=this.data.detail.id;
    wx.showModal({title:'放下这次回响？',content:'这条记录和回信会从本机移除。',confirmText:'放下',confirmColor:'#b3261e',cancelText:'留着',success:r=>{
      if(r.confirm&&this.persist({...this._store,entries:this._store.entries.filter(e=>e.id!==id)})) {
        this.dismissSheet();
        if(this.data.result&&this.data.result.id===id) this.anotherQuestion();
        this.notify('已放下这次回响');
      }
    }});
  },
  toggleVibration(e) {
    const vibration=e.detail.value;
    if(this.persist({...this._store,vibration})) this.setData({vibration});
  },
  goAsk() { this.changeScene({tab:'ask',phase:'idle',question:'',result:null},'back'); },
  openSeal() {
    if(this.data.sealOpen||this.data.shareCardOpen||this._sceneBusy||this.data.brandTransition||this.data.sheetClosing)return;
    const entry=this.data.sheet==='detail'?this.data.detail:this.data.result;if(!entry)return;
    if((this._store.capsules||[]).length>=50){this.notify('已存满 50 封，请先整理写给未来的回响','error');return;}
    this._sealSource={...entry};wx.hideKeyboard();
    this.setData({sealOpen:true,sealDraft:'',sealDate:journey.dateAfter(7),minSealDate:journey.dateAfter(1),maxSealDate:journey.dateAfter(1825),sealOrigin:entry.text,keyboardHeight:0,sealRemind:false});
  },
  onSealRemind(e){this.setData({sealRemind:this.data.remindersAvailable&&!!e.detail.value});},
  onSealMessage(e){this.setData({sealDraft:e.detail.value});},
  onSealDate(e){this.setData({sealDate:e.detail.value});},
  closeSeal() {
    if(!this.data.sealOpen)return;
    const close=()=>{if(this._disposed)return;wx.hideKeyboard();this._sealSource=null;this.setData({sealOpen:false,sealDraft:'',keyboardHeight:0});};
    if(this.data.sealDraft.trim())wx.showModal({title:'这句话还没有封存',content:'离开后，这次写给未来的留言不会保留。',confirmText:'继续写',cancelText:'暂不保留',success:r=>{if(r.cancel)close();}});else close();
  },
  saveCapsule() {
    if(!this.data.sealOpen||!this._sealSource)return;
    const now=Date.now(),unlockAt=journey.parseDate(this.data.sealDate),capsules=this._store.capsules||[];
    if(!Number.isFinite(unlockAt)||unlockAt<=now||this.data.sealDate>journey.dateAfter(1825,now)){this.notify('请选择明天到五年内的日期','error');return;}
    if(capsules.length>=50){this.notify('已存满 50 封，请先整理','error');return;}
    const source=this._sealSource;
    const capsule={id:'c'+now+'-'+Math.random().toString(36).slice(2,7),createdAt:now,unlockAt,openedAt:0,sourceId:source.id,text:source.text,reflection:source.reflection||'',label:source.label||'此刻的回响',question:source.question||'',message:this.data.sealDraft.trim().slice(0,300)};
    if(!this.persist({...this._store,capsules:[capsule,...capsules]}))return;
    const wantsReminder=this.data.sealRemind&&this.data.remindersAvailable;
    wx.hideKeyboard();this._sealSource=null;this.setData({sealOpen:false,sealDraft:'',keyboardHeight:0});this.notify('已封存，到那一天再打开');
    if(wantsReminder)this.requestCapsuleReminder({currentTarget:{dataset:{id:capsule.id}}});
  },
  commitReminder(id,state) {
    // 订阅期间可能切后台或销毁页面，回调读取最新存储，避免覆盖新的回信或信封。
    const latest=store.read();if(!latest.capsules.some(c=>c.id===id))return false;
    const next={...latest,capsules:latest.capsules.map(c=>c.id===id?{...c,reminder:state}:c)};
    try{store.write(next);}catch(error){if(!this._disposed)this.notify('提醒状态未能保存，请稍后重试','error');return false;}
    if(!this._disposed){this._store=next;this.refreshTime();}return true;
  },
  requestCapsuleReminder(e) {
    const id=e.currentTarget.dataset.id,item=(this._store.capsules||[]).find(c=>c.id===id);
    if(!item||this._reminderBusy||this.data.reminderFlight||item.unlockAt<=Date.now()||item.reminder==='pending'||!reminders.available())return;
    // 先留下待确认标记。即使云端已建任务后本机写入失败，删除时仍会先取消任务。
    if(!this.commitReminder(id,'requested'))return;
    this._reminderBusy=id;this.setData({reminderBusyId:id});
    return reminders.subscribe({id,unlockDate:journey.dateValue(item.unlockAt)}).then(result=>{
      const saved=this.commitReminder(id,result.state);
      if(saved&&!this._disposed&&this.data.pageActive){
        if(result.state==='pending'){this.playReminderFlight();return;}
        const messages={pending:'已订阅，约定日早上 9 点提醒',declined:'信已封存，本次不发送提醒',failed:'信已封存，提醒未设置成功，可在信封列表重试',sent:'这封信已经发送过提醒',uncertain:'提醒发送状态待核对，请直接查看信封'};
        this.notify(messages[result.state]||'信已封存，提醒暂不可用',result.state==='failed'?'error':'success');
      }
    }).finally(()=>{this._reminderBusy='';if(!this._disposed)this.setData({reminderBusyId:''});});
  },
  playReminderFlight() {
    if(this._disposed||!this.data.pageActive||this.data.reminderFlight)return;
    clearTimeout(this._noticeTimer);clearTimeout(this._noticeExitTimer);
    this.setData({reminderFlight:true,notice:'',noticeClosing:false});
    // 逐帧运动交给 WXSS；仅保留一次兜底回收，不创建帧循环或位图缓冲。
    this._reminderFlightTimer=setTimeout(()=>this.finishReminderFlight(),3250);
  },
  onReminderFlightEnd(e) {
    if(e.target&&e.target.id==='reminder-flight')this.finishReminderFlight();
  },
  finishReminderFlight() {
    clearTimeout(this._reminderFlightTimer);this._reminderFlightTimer=null;
    if(!this._disposed&&this.data.reminderFlight)this.setData({reminderFlight:false});
  },
  refreshReminders() {
    if(!reminders.available()||this._refreshingReminders||this._reminderBusy)return;
    const items=(this._store.capsules||[]).filter(c=>['requested','pending','failed','uncertain'].includes(c.reminder));
    if(!items.length)return;
    this._refreshingReminders=true;
    return Promise.all(items.map(c=>reminders.status({id:c.id}).then(result=>{
      if(['pending','sending','sent','uncertain','cancelled'].includes(result.state))this.commitReminder(c.id,result.state==='sending'?'pending':result.state);
    },()=>{}))).finally(()=>{this._refreshingReminders=false;});
  },
  openReminderLink(id) {
    if(typeof id!=='string'||!/^c[0-9]+-[a-z0-9]+$/.test(id))return;
    const item=(this._store.capsules||[]).find(c=>c.id===id);
    if(this.data.sheet||this.data.sealOpen||this.data.shareCardOpen||this._sceneBusy){this.notify('请先完成当前编辑，再到「我的回响」查看信封');return;}
    this.setData({tab:'echo',phase:'idle',sheet:'capsules',sheetClosing:false});this.refreshTime();
    if(!item){this.notify('当前设备没有这封信，请回到封存它的设备查看','error');return;}
    if(Date.now()>=item.unlockAt)this.openCapsule({currentTarget:{dataset:{id}}});
  },
  openCapsules() {if(this.data.sheet||this._sceneBusy)return;this.refreshTime();this.setData({sheet:'capsules',sheetClosing:false,capsule:null});},
  openCapsule(e) {
    if(this.data.sheet!=='capsules'||this.data.sheetClosing)return;
    this.refreshTime();const now=Date.now(),item=(this._store.capsules||[]).find(c=>c.id===e.currentTarget.dataset.id);if(!item)return;
    if(now<item.unlockAt){this.notify(journey.dateValue(item.unlockAt)+' 再打开');return;}
    const openedAt=item.openedAt||now;
    if(!item.openedAt&&!this.persist({...this._store,capsules:this._store.capsules.map(c=>c.id===item.id?{...c,openedAt}:c)}))return;
    this.setData({sheet:'capsule',capsule:{...item,openedAt,createdDate:journey.dateValue(item.createdAt),unlockDate:journey.dateValue(item.unlockAt)}});this.buzz();
  },
  backToCapsules(){this.refreshTime();this.setData({sheet:'capsules',capsule:null});},
  deleteCapsule(e) {
    const id=e.currentTarget.dataset.id;if(this.data.sheet!=='capsules'||this._reminderBusy)return;
    wx.showModal({title:'放下这封未来回响？',content:'封存的答案和留言会从本机移除，原来的历史记录仍会保留。已设置的提醒会先取消。',confirmText:'放下',confirmColor:'#b3261e',cancelText:'留着',success:r=>{
      if(this._disposed||!r.confirm)return;
      const item=(this._store.capsules||[]).find(c=>c.id===id);if(!item)return;
      const remove=message=>{if(!this._disposed&&this.persist({...this._store,capsules:this._store.capsules.filter(c=>c.id!==id)}))this.notify(message||'已放下这封回响');};
      if(!['requested','pending','failed','uncertain'].includes(item.reminder)){remove();return;}
      this._reminderBusy=id;this.setData({reminderBusyId:id});
      reminders.cancel({id}).then(result=>{this.commitReminder(id,'cancelled');remove(result.state==='sending'?'信已移除，提醒正在发送中，可能仍会收到这一次通知':'');},()=>{if(!this._disposed)this.notify('取消提醒需要联网，信封暂时保留，请稍后重试','error');}).finally(()=>{this._reminderBusy='';if(!this._disposed)this.setData({reminderBusyId:''});});
    }});
  },
  openShareCard() {
    if(this.data.shareCardOpen||this.data.sealOpen||(this.data.sheet&&this.data.sheet!=='detail')||this._sceneBusy||this.data.brandTransition||this.data.sheetClosing)return;
    const entry=this.data.sheet==='detail'?this.data.detail:this.data.result;
    if(!entry)return;
    wx.hideKeyboard();
    this._shareCardContent=publicContent(entry);
    this.setData({shareCardOpen:true,shareBusy:true,shareImagePath:'',shareError:false,shareSaving:false});
    this.generateShareCard();
  },
  generateShareCard() {
    if(!this._shareCardContent||!this.data.shareCardOpen)return;
    const request=++this._shareRequest;
    this.setData({shareBusy:true,shareError:false,shareImagePath:''});
    return createAnswerImage(this,this._shareCardContent).then(file=>{
      if(!this._disposed&&request===this._shareRequest)this.setData({shareImagePath:file,shareBusy:false});
    },()=>{if(!this._disposed&&request===this._shareRequest)this.setData({shareBusy:false,shareError:true});});
  },
  closeShareCard() {
    if(this.data.shareSaving)return;
    this._shareRequest++;this._shareCardContent=null;
    this.setData({shareCardOpen:false,shareBusy:false,shareImagePath:'',shareError:false});
  },
  previewShareImage() {
    if(this.data.shareImagePath)wx.previewImage({current:this.data.shareImagePath,urls:[this.data.shareImagePath],fail:()=>this.notify('图片暂时无法打开，请重新生成','error')});
  },
  sendShareImage() {
    if(!this.data.shareImagePath||!this.data.canShareImage||this._sendingImage)return;
    this._sendingImage=true;const request=this._shareRequest;
    const fallback=()=>{if(!this._disposed&&request===this._shareRequest){this.setData({canShareImage:false});this.notify('请保存图片后，从相册发送','error');}};
    try{wx.showShareImageMenu({path:this.data.shareImagePath,needShowEntrance:false,fail:error=>{
      if(!/cancel/i.test(error.errMsg||''))fallback();
    },complete:()=>{this._sendingImage=false;}});}catch(error){this._sendingImage=false;fallback();}
  },
  saveShareImage() {
    if(!this.data.shareImagePath||this.data.shareSaving)return;
    this.setData({shareSaving:true});
    const request=this._shareRequest;
    try{wx.saveImageToPhotosAlbum({filePath:this.data.shareImagePath,success:()=>{
      if(!this._disposed&&request===this._shareRequest)this.notify('卡片已保存到相册');
    },fail:error=>{
      if(this._disposed||request!==this._shareRequest||/cancel/i.test(error.errMsg||''))return;
      if(/privacy/i.test(error.errMsg||'')){this.notify('请先完成微信隐私授权，再重试','error');return;}
      if(/auth|deny|permission/i.test(error.errMsg||'')){
        wx.showModal({title:'需要相册权限',content:'允许保存图片后，就能把这张卡片留到相册。',confirmText:'去设置',cancelText:'暂时不用',success:r=>{if(r.confirm)wx.openSetting({});}});
      }else this.notify('保存没有完成，请稍后重试','error');
    },complete:()=>{if(!this._disposed&&request===this._shareRequest)this.setData({shareSaving:false});}});}catch(error){this.setData({shareSaving:false});this.notify('当前环境无法保存，请在手机微信中重试','error');}
  },
});
