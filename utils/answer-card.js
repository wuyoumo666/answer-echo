// Canvas 2D 绘制，同一份代码可在浏览器验收。仅提取用户选择分享的字段。
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
function publicContent(entry) {
  return {question:String(entry.question||'').trim(),text:String(entry.text||''),reflection:String(entry.reflection||''),label:String(entry.label||'此刻的回响')};
}
function wrapText(ctx,text,width) {
  const lines=[];
  String(text).split('\n').forEach(paragraph=>{
    let line='';
    Array.from(paragraph).forEach(char=>{
      if(line&&ctx.measureText(line+char).width>width){
        if(/[，。！？；：、”」）]/.test(char)||/[“「（]$/.test(line)){
          const chars=Array.from(line);const carry=chars.pop();
          if(chars.length)lines.push(chars.join(''));
          line=carry+char;
        }else{lines.push(line);line=char;}
      }else line+=char;
    });
    if(line||!paragraph)lines.push(line);
  });
  return lines;
}
function wrapHeadline(ctx,text,width) {
  if(text.includes('\n')||ctx.measureText(text).width<=width)return wrapText(ctx,text,width);
  const chars=Array.from(text),cuts=[];
  for(let cut=1;cut<chars.length;cut++){
    if(/[，。！？；：、”」）]/.test(chars[cut])||/[“「（]/.test(chars[cut-1]))continue;
    const left=chars.slice(0,cut).join(''),right=chars.slice(cut).join('');
    const a=ctx.measureText(left).width,b=ctx.measureText(right).width;
    if(a<=width&&b<=width)cuts.push({left,right,score:Math.abs(a-b)+(/[，；：]/.test(chars[cut-1])?0:1000)});
  }
  if(!cuts.length)return wrapText(ctx,text,width);
  cuts.sort((a,b)=>a.score-b.score);return[cuts[0].left,cuts[0].right];
}
function layoutCard(ctx,entry) {
  const content=publicContent(entry),fontSize=Array.from(content.text).length>24?26:30;
  const questionFontSize=12.5,questionLineHeight=21,questionY=145;
  ctx.font='500 '+questionFontSize+'px '+FONT;
  const questionLines=content.question?wrapText(ctx,content.question,295):[];
  ctx.font='600 '+fontSize+'px '+FONT;
  const lines=wrapHeadline(ctx,content.text,299);
  ctx.font='500 14px '+FONT;
  const reflectionLines=wrapText(ctx,content.reflection,291);
  const mainY=questionLines.length?questionY+questionLines.length*questionLineHeight+55:170,lineHeight=fontSize*1.6;
  const reflectionY=mainY+lines.length*lineHeight+27;
  const contentBottom=reflectionY+reflectionLines.length*26;
  const height=Math.max(questionLines.length?560:500,Math.ceil(contentBottom+133));
  return {...content,width:375,height,fontSize,lineHeight,mainY,reflectionY,lines,reflectionLines,questionY,questionFontSize,questionLineHeight,questionLines,footerY:height-76};
}
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function wash(ctx,x,y,r,color,w,h){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
function drawCard(ctx,layout,logo) {
  const {width:w,height:h}=layout;
  ctx.fillStyle='#eef3f9';ctx.fillRect(0,0,w,h);
  rounded(ctx,14,14,w-28,h-28,24);ctx.fillStyle='#fcfdff';ctx.fill();
  ctx.save();rounded(ctx,14,14,w-28,h-28,24);ctx.clip();
  wash(ctx,38,35,265,'rgba(143,178,239,.13)',w,h);
  wash(ctx,w,h*.5,300,'rgba(234,177,188,.10)',w,h);
  wash(ctx,20,h,270,'rgba(160,208,186,.10)',w,h);ctx.restore();
  rounded(ctx,14.5,14.5,w-29,h-29,24);ctx.strokeStyle='#dfe7f1';ctx.lineWidth=1;ctx.stroke();
  ctx.save();rounded(ctx,38,42,34,34,10);ctx.clip();ctx.fillStyle='#fff';ctx.fillRect(38,42,34,34);
  if(logo)ctx.drawImage(logo,38,42,34,34);ctx.restore();
  ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#33435b';ctx.font='600 17px '+FONT;ctx.fillText('答案回响',84,42);
  ctx.fillStyle='#97a4b7';ctx.font='500 10px '+FONT;ctx.fillText('一个疑问，一声回响',85,67);
  ['#7ca6e8','#e5a1a7','#e5c987','#96c2ac'].forEach((color,i)=>{rounded(ctx,303+i*9,52,7,3,1.5);ctx.fillStyle=color;ctx.fill();});
  ctx.strokeStyle='#e4eaf2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(38,102);ctx.lineTo(337,102);ctx.stroke();
  if(layout.questionLines.length){
    ctx.fillStyle='#a0adbf';ctx.font='500 10px '+FONT;ctx.fillText('此刻的疑问',38,123);
    ctx.fillStyle='#91a0b6';ctx.font='500 '+layout.questionFontSize+'px '+FONT;
    layout.questionLines.forEach((line,i)=>ctx.fillText(line,38,layout.questionY+i*layout.questionLineHeight));
  }
  ctx.fillStyle='#c7d6ed';ctx.font='500 38px '+FONT;ctx.fillText('“',35,layout.mainY-45);
  ctx.fillStyle='#29384f';ctx.font='600 '+layout.fontSize+'px '+FONT;
  layout.lines.forEach((line,i)=>ctx.fillText(line,38,layout.mainY+i*layout.lineHeight));
  ctx.fillStyle='#76869e';ctx.font='500 14px '+FONT;
  layout.reflectionLines.forEach((line,i)=>ctx.fillText(line,39,layout.reflectionY+i*26));
  ctx.strokeStyle='#e3e9f1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(38,layout.footerY);ctx.lineTo(337,layout.footerY);ctx.stroke();
  ctx.font='500 10.5px '+FONT;const labelWidth=ctx.measureText(layout.label).width;
  rounded(ctx,38,layout.footerY+14,labelWidth+20,22,11);ctx.fillStyle='#eef3fa';ctx.fill();
  ctx.fillStyle='#7f93af';ctx.fillText(layout.label,48,layout.footerY+20);
  ctx.textAlign='right';ctx.fillStyle='#a0adbf';ctx.font='500 9.5px '+FONT;ctx.fillText('给此刻的你',337,layout.footerY+21);
  ctx.textAlign='center';ctx.fillStyle='#9ba8ba';ctx.font='500 10px '+FONT;ctx.fillText('答案是一种灵感，决定留给你。',w/2,h-30);
  ctx.textAlign='left';
}
function createAnswerImage(page,entry) {
  const content=publicContent(entry);
  return new Promise((resolve,reject)=>{
    wx.createSelectorQuery().in(page).select('#answer-image-canvas').fields({node:true,size:true}).exec(result=>{
      try{
        const canvas=result&&result[0]&&result[0].node;
        if(!canvas)throw new Error('Canvas is unavailable');
        const ctx=canvas.getContext('2d'),layout=layoutCard(ctx,content),scale=2;
        canvas.width=layout.width*scale;canvas.height=layout.height*scale;ctx.scale(scale,scale);
        const render=logo=>{
          try{drawCard(ctx,layout,logo);wx.canvasToTempFilePath({canvas,destWidth:canvas.width,destHeight:canvas.height,fileType:'png',success:r=>resolve(r.tempFilePath),fail:reject},page);}catch(error){reject(error);}
        };
        const image=canvas.createImage();let finished=false;
        const finish=logo=>{if(finished)return;finished=true;clearTimeout(timer);render(logo);};
        const timer=setTimeout(()=>finish(null),4000);
        image.onload=()=>finish(image);image.onerror=()=>finish(null);image.src='/assets/brand-mark.png';
      }catch(error){reject(error);}
    });
  });
}
module.exports={publicContent,wrapText,wrapHeadline,layoutCard,drawCard,createAnswerImage};
