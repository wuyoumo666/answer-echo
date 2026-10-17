const INTUITIONS=[{value:'continue',label:'我想继续'},{value:'stop',label:'我想停下'},{value:'unsure',label:'我还不知道'}];
const OUTCOMES=[{value:'acted',label:'我行动了'},{value:'changed',label:'我换了方向'},{value:'settled',label:'已经不困扰了'}];
const RESPONSES=[{value:'yes',label:'是我想听的'},{value:'other',label:'我期待另一句'}];
function choice(list,value){return list.some(item=>item.value===value)?value:'';}
function label(list,value){const item=list.find(item=>item.value===value);return item?item.label:'';}
function dateValue(stamp){const d=new Date(stamp);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dateAfter(days,now){const d=new Date(now==null?Date.now():now);d.setHours(0,0,0,0);d.setDate(d.getDate()+days);return dateValue(d.getTime());}
function parseDate(value){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');if(!match)return NaN;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const d=new Date(year,month-1,day,0,0,0,0);
  return d.getFullYear()===year&&d.getMonth()===month-1&&d.getDate()===day?d.getTime():NaN;
}
function capsuleSummary(capsule,now){
  // 未到期列表只向视图提供信封元信息，不透出正文或私人留言。
  const ready=now>=capsule.unlockAt;
  const reminder=capsule.reminder||'';
  return {id:capsule.id,createdDate:dateValue(capsule.createdAt),unlockDate:dateValue(capsule.unlockAt),ready,opened:!!capsule.openedAt,status:ready?(capsule.openedAt?'已经打开':'可以打开了'):'等待那一天',reminder,reminderLabel:reminder==='pending'?'已订阅到期提醒':reminder==='sent'?'已发送提醒':reminder==='uncertain'?'提醒状态待核对':reminder==='failed'?'提醒未设置成功':''};
}
module.exports={INTUITIONS,OUTCOMES,RESPONSES,choice,label,dateValue,dateAfter,parseDate,capsuleSummary};
