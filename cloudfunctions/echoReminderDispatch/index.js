const cloud=require('wx-server-sdk');
const config=require('./reminder-config.json');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
async function transaction(fn){
  return db.runTransaction(fn,3);
}
function templateData(job){
  // 字段键名必须来自公众平台真实模板；只允许固定品牌文案与日期。
  const tokens={title:'打开写给未来的信',status:'约定的日子到了，回来看看吧',date:job.unlockDate,time:job.unlockDate+' 09:00'};
  const data={};
  for(const [key,token] of Object.entries(job.dataFields||config.dataFields)){
    if(!/^(thing|time|date|phrase)\d+$/.test(key)||!Object.hasOwnProperty.call(tokens,token))throw Error('INVALID_TEMPLATE_FIELDS');
    if(key.startsWith('phrase')&&tokens[token].length>5)throw Error('INVALID_PHRASE');
    data[key]={value:tokens[token]};
  }
  if(!Object.keys(data).length)throw Error('MISSING_TEMPLATE_FIELDS');
  return data;
}
async function claim(id,now){
  return transaction(async tx=>{
    const ref=tx.collection('echo_reminders').doc(id),job=(await ref.get()).data;
    if(!job||job.state!=='pending'||job.dueAt>now)return null;
    await ref.update({data:{state:'sending',updatedAt:now}});
    return {...job,_id:id};
  });
}
async function finish(job,state,now,errorCode){
  return transaction(async tx=>{
    const ref=tx.collection('echo_reminders').doc(job._id),current=(await ref.get()).data;
    if(!current||current.state!=='sending')return;
    // 终态只留去重所需元信息，不长期保留 OpenID。
    await ref.set({data:{owner:current.owner,capsuleId:current.capsuleId,state,updatedAt:now,errorCode:errorCode||''}});
    const ownerDoc=tx.collection('echo_reminders').doc('owner-'+current.owner),account=(await ownerDoc.get()).data;
    if(account)await ownerDoc.set({data:{active:(account.active||[]).filter(id=>id!==job._id)}});
  });
}
async function dispatch(now=Date.now(),deadline=Date.now()+45000){
  if(!config.enabled||!config.templateId)return {ok:false,error:'NOT_CONFIGURED'};
  templateData({unlockDate:'2026-01-01'});
  // 崩溃/超时后不能确定微信是否已经收件，标记待核对，绝不自动补发。
  const stuck=await db.collection('echo_reminders').where({state:'sending',updatedAt:db.command.lte(now-10*60000)}).limit(50).get();
  for(const job of stuck.data){if(Date.now()>=deadline)break;await finish(job,'uncertain',now,'INTERRUPTED');}
  const list=await db.collection('echo_reminders').where({state:'pending',dueAt:db.command.lte(now)}).orderBy('dueAt','asc').limit(50).get();
  let sent=0,uncertain=0;
  for(const candidate of list.data){
    // 为一次发送及写入终态留出时间，其余任务留给下一次定时触发。
    if(Date.now()>=deadline)break;
    const job=await claim(candidate._id,now);if(!job)continue;
    try{
      // 外部消息发送必须在事务提交后执行，否则事务重试会造成重复通知。
      const response=await cloud.openapi.subscribeMessage.send({touser:job.openid,templateId:job.templateId,page:'pages/index/index?capsuleId='+encodeURIComponent(job.capsuleId),data:templateData(job),miniprogramState:config.miniprogramState,lang:'zh_CN'});
      if(response&&response.errCode)throw Object.assign(Error('WECHAT_REJECTED'),{errCode:response.errCode});
    }catch(error){
      await finish(job,'uncertain',Date.now(),String(error.errCode||'DELIVERY_UNKNOWN'));
      uncertain++;continue;
    }
    // 成功后写库失败会保留 sending，由之后的扫描归为 uncertain；仍然不重发。
    await finish(job,'sent',Date.now());sent++;
  }
  return {ok:true,sent,uncertain};
}
exports.main=async (event,context)=>{
  const identity=cloud.getWXContext();
  // 微信客户端即使伪造 Timer 事件也不能触发全站发送。
  if(identity.OPENID||!event||event.Type!=='Timer'||event.TriggerName!=='echoReminderDue')return {ok:false,error:'FORBIDDEN'};
  const limit=Number(context&&context.time_limit_in_ms);
  if(limit&&limit<60000)return {ok:false,error:'SET_FUNCTION_TIMEOUT_TO_60_SECONDS'};
  try{return await dispatch();}catch(error){console.error('reminder dispatch failed',{code:error.errCode||'DISPATCH_FAILED'});return {ok:false,error:'DISPATCH_FAILED'};}
};
exports.dispatch=dispatch;
exports.templateData=templateData;
