const cloud=require('wx-server-sdk');
const crypto=require('crypto');
const config=require('./reminder-config.json');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database({throwOnNotFound:false});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function read(doc){
  try{return (await doc.get()).data||null;}catch(error){
    if(/document.*(not exist|not found)|文档不存在/i.test(error.errMsg||error.message||''))return null;
    throw error;
  }
}
async function transaction(fn){
  return db.runTransaction(fn,3);
}
function dueTime(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NaN;
  const value=Date.parse(date+'T09:00:00+08:00');
  return Number.isFinite(value)&&new Date(value+8*3600000).toISOString().slice(0,10)===date?value:NaN;
}
async function handle(event,identity,now=Date.now()){
  if(!identity.OPENID||identity.APPID!==config.appid)return {ok:false,error:'UNAUTHORIZED'};
  const capsuleId=event.capsuleId;
  if(typeof capsuleId!=='string'||!/^c[0-9]{10,16}-[a-z0-9]{1,12}$/.test(capsuleId))return {ok:false,error:'INVALID_ID'};
  const owner=hash(identity.OPENID),id=hash(owner+':'+capsuleId);
  if(!['schedule','cancel','status'].includes(event.action))return {ok:false,error:'INVALID_ACTION'};
  if(event.action==='schedule'&&(!config.enabled||!config.templateId))return {ok:false,error:'NOT_CONFIGURED'};
  const dueAt=dueTime(event.unlockDate);
  if(event.action==='schedule'&&(!Number.isFinite(dueAt)||dueAt<=now||dueAt>now+1826*86400000))return {ok:false,error:'INVALID_DATE'};
  return transaction(async tx=>{
    const jobDoc=tx.collection('echo_reminders').doc(id),job=await read(jobDoc);
    if(event.action==='status')return {ok:true,state:job?job.state:'none',dueAt:job&&job.dueAt};
    const ownerDoc=tx.collection('echo_reminders').doc('owner-'+owner),account=await read(ownerDoc)||{active:[]};
    const active=account.active||[];
    if(event.action==='cancel'){
      if(job&&job.state==='sending')return {ok:true,state:'sending'};
      // 即使尚未查到任务也写取消标记，抵挡延迟到达的封存请求。
      if(!job||job.state==='pending')await jobDoc.set({data:{owner,capsuleId,state:'cancelled',updatedAt:now}});
      await ownerDoc.set({data:{active:active.filter(value=>value!==id)}});
      return {ok:true,state:'cancelled'};
    }
    // 同一信封只能安排一次；网络重试不能重置已发送/不确定的任务。
    if(job)return {ok:true,state:job.state,dueAt:job.dueAt};
    if(active.length>=50)return {ok:false,error:'LIMIT_REACHED'};
    await jobDoc.set({data:{owner,capsuleId,openid:identity.OPENID,dueAt,unlockDate:event.unlockDate,templateId:config.templateId,dataFields:config.dataFields,state:'pending',createdAt:now,updatedAt:now}});
    await ownerDoc.set({data:{active:[...active,id]}});
    return {ok:true,state:'pending',dueAt};
  });
}
exports.main=async event=>{
  try{return await handle(event||{},cloud.getWXContext());}catch(error){console.error('reminder management failed',{code:error.errCode||'DATABASE_FAILED'});return {ok:false,error:'TEMPORARILY_UNAVAILABLE'};}
};
exports.handle=handle;
exports.dueTime=dueTime;
