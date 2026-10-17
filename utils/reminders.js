const config=require('../config/reminders');
let initialized=false;
function available(){return !!(config.enabled&&config.env&&config.templateId&&wx.cloud&&typeof wx.cloud.init==='function'&&typeof wx.cloud.callFunction==='function'&&typeof wx.requestSubscribeMessage==='function');}
function call(action,capsule){
  if(!available())return Promise.reject(new Error('NOT_CONFIGURED'));
  try{
    if(!initialized){wx.cloud.init({env:config.env,traceUser:false});initialized=true;}
    // 不上传答案、疑问、回信、未来留言，也不接受客户端传入的收件人。
    return wx.cloud.callFunction({name:config.functionName,config:{env:config.env},data:{action,capsuleId:capsule.id,unlockDate:capsule.unlockDate}}).then(response=>{
      const result=response.result;
      if(!result||!result.ok)throw new Error(result&&result.error||'CLOUD_FAILED');
      return result;
    });
  }catch(error){return Promise.reject(error);}
}
function subscribe(capsule){
  if(!available())return Promise.resolve({state:'unavailable'});
  // 必须在用户点击的调用栈中拉起授权，前面不能先等待网络请求。
  return new Promise(resolve=>{
    try{wx.requestSubscribeMessage({tmplIds:[config.templateId],success:response=>{
      if(response[config.templateId]!=='accept'){resolve({state:'declined'});return;}
      call('schedule',capsule).then(result=>resolve({state:result.state,dueAt:result.dueAt}),()=>resolve({state:'failed'}));
    },fail:()=>resolve({state:'failed'})});}catch(error){resolve({state:'failed'});}
  });
}
function cancel(capsule){return call('cancel',capsule);}
function status(capsule){return call('status',capsule);}
module.exports={available,subscribe,cancel,status};
