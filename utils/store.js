const KEY = 'answer-echo-v2';
const journey = require('./journey');
function empty() { return {version:2,entries:[],capsules:[],vibration:true}; }
function validStamp(value){return Number.isFinite(value)&&Number.isFinite(new Date(value).getTime());}
function validRecord(e){return e&&typeof e.id==='string'&&typeof e.text==='string'&&validStamp(e.createdAt);}
function normalize(e){return {...e,question:typeof e.question==='string'?e.question:'',reflection:typeof e.reflection==='string'?e.reflection:'',label:typeof e.label==='string'?e.label:'此刻的回响',note:typeof e.note==='string'?e.note:'',favorite:!!e.favorite,intuition:journey.choice(journey.INTUITIONS,e.intuition),response:journey.choice(journey.RESPONSES,e.response),outcome:journey.choice(journey.OUTCOMES,e.outcome)};}
function read() {
  try {
    const value = wx.getStorageSync(KEY);
    if (!value || value.version !== 2 || !Array.isArray(value.entries)) return empty();
    return {version:2,vibration:value.vibration!==false,entries:value.entries.filter(validRecord).map(normalize).slice(0,200),capsules:(Array.isArray(value.capsules)?value.capsules:[]).filter(e=>validRecord(e)&&validStamp(e.unlockAt)&&e.unlockAt>e.createdAt).map(e=>({...normalize(e),message:typeof e.message==='string'?e.message:'',openedAt:validStamp(e.openedAt)&&e.openedAt>=e.unlockAt?e.openedAt:0}))};
  } catch (error) { return empty(); }
}
function write(value) {
  // 抛出失败，由页面提示；不能把保存失败显示成保存成功。
  wx.setStorageSync(KEY, value);
}
function formatDate(stamp) {
  const d = new Date(stamp);
  return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');
}
function decorate(entries) { return entries.map(e => ({...e,date:formatDate(e.createdAt),canReflect:Date.now()-e.createdAt>=3*86400000,intuitionLabel:journey.label(journey.INTUITIONS,e.intuition),responseLabel:journey.label(journey.RESPONSES,e.response),outcomeLabel:journey.label(journey.OUTCOMES,e.outcome)})); }
module.exports = {read,write,decorate,formatDate};
