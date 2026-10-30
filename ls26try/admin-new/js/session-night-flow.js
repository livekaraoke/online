/* Session History NIGHT FLOW: read-only, derived from the session data already loaded. */
(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  if(root) root.LS26NightFlow=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const MODES={
    bpm:{title:"BPM",color:"#00cafa",unit:" BPM"},
    year:{title:"RELEASE YEAR",color:"#f5bd56",unit:""},
    host:{title:"HOST REACTION",color:"#48dca4",unit:""},
    singer:{title:"SINGER EXPERIENCE",color:"#bba2ff",unit:""}
  };
  const HOST={weak:1,average:2,good:3,great:4};
  const SINGER={notgreat:1,okay:2,good:3,amazing:4};
  const LABELS={host:["","WEAK","AVERAGE","GOOD","GREAT"],singer:["","NOT GREAT","OKAY","GOOD","AMAZING"]};
  const escapeHtml=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const finite=(v,min,max)=>{
    if(v==null||v==="")return null;
    const n=Number(v);
    return Number.isFinite(n)&&n>=min&&n<=max?n:null;
  };
  const stamp=v=>{
    if(v==null)return 0;
    if(typeof v.toMillis==="function")return v.toMillis();
    if(typeof v.toDate==="function")return v.toDate().getTime();
    if(typeof v==="number")return v;
    if(typeof v.seconds==="number")return v.seconds*1000+Math.floor((v.nanoseconds||0)/1000000);
    const result=Date.parse(v);
    return Number.isFinite(result)?result:0;
  };
  const timeOf=item=>finite(item?.playingAtMs||item?.playedAtMs||item?.startedAtMs,1,99999999999999)
    ||stamp(item?.playedAt||item?.startedAt||item?.playingAt||item?.createdAt)||0;
  const yearOf=item=>{
    const raw=[item?.releaseYear,item?.songReleaseYear,item?.songYear,item?.year,item?.yearReleased,
      item?.originalYear,item?.songMetadata?.releaseYear,item?.songMetadata?.year,item?.releaseDate]
      .find(v=>v!==undefined&&v!==null&&v!=="");
    if(typeof raw==="string"&&/^\d{4}-/.test(raw))return finite(raw.slice(0,4),1880,2100);
    return finite(raw,1880,2100);
  };
  const valueOf=(item,mode)=>{
    if(mode==="bpm")return finite(item.performanceBpm??item.userBpm??item.songUserBpm??item.bpm??item.originalBpm,20,350);
    if(mode==="year")return yearOf(item);
    const raw=String(mode==="host"?item.crowdResponse??"":item.singerExperienceRating??"").toLowerCase().replace(/[\s_-]+/g,"");
    return (mode==="host"?HOST:SINGER)[raw]??null;
  };
  function buildModel(played=[],breaks=[]){
    const songs=(Array.isArray(played)?played:[]).map((item,index)=>({
      index, title:String(item.songTitle||item.title||item.songId||"Untitled Song"),
      artist:String(item.songArtist||item.artist||""),time:timeOf(item),
      metrics:Object.fromEntries(Object.keys(MODES).map(mode=>[mode,valueOf(item,mode)]))
    }));
    // Caller supplies the same chronological performed-song array used by the history list.
    const markers=(Array.isArray(breaks)?breaks:[]).map((br,i)=>{
      const started=stamp(br.startedAt||br.start);
      if(!started)return null;
      const before=songs.filter(song=>song.time&&song.time<=started).length;
      return {index:i+1,after:before,time:started};
    }).filter(Boolean);
    return {songs,markers,breakCount:Array.isArray(breaks)?breaks.length:0};
  }
  function valueLabel(mode,v){
    return v==null?"Not recorded":mode==="host"||mode==="singer"?LABELS[mode][v]:(String(v)+MODES[mode].unit);
  }
  function summary(model,mode){
    const values=model.songs.map(s=>s.metrics[mode]).filter(v=>v!=null);
    if(!values.length)return "No "+MODES[mode].title.toLowerCase()+" values recorded";
    if(mode==="bpm")return values.length+"/"+model.songs.length+" measured · Avg "+Math.round(values.reduce((a,b)=>a+b,0)/values.length)+" BPM · "+Math.min(...values)+"–"+Math.max(...values)+" BPM";
    if(mode==="year")return values.length+"/"+model.songs.length+" dated · "+Math.min(...values)+"–"+Math.max(...values);
    return values.length+"/"+model.songs.length+" rated";
  }
  function ticks(mode,values){
    if(mode==="host"||mode==="singer")return [1,2,3,4];
    const min=Math.min(...values),max=Math.max(...values);
    const padding=mode==="year"?Math.max(2,Math.ceil((max-min)*0.12)):Math.max(6,Math.ceil((max-min)*0.12));
    const lower=mode==="year"?Math.max(1880,min-padding):Math.max(0,min-padding);
    const upper=max+padding;
    return Array.from({length:5},(_,i)=>lower+(upper-lower)*i/4);
  }
  function renderSvg(model,mode){
    const data=model.songs,valid=data.map(x=>x.metrics[mode]).filter(x=>x!=null);
    if(!data.length||!valid.length)return "";
    const left=58,right=22,top=20,bottom=58,step=56,height=260;
    const width=Math.max(520,left+right+Math.max(1,data.length-1)*step);
    const plotBottom=height-bottom,plotHeight=plotBottom-top;
    const marks=ticks(mode,valid),min=marks[0],max=marks[marks.length-1];
    const x=i=>left+i*step;
    const y=v=>top+(max-v)/(max-min||1)*plotHeight;
    const col=MODES[mode].color;
    const out=['<svg class="night-flow-svg" role="img" aria-label="'+escapeHtml(MODES[mode].title)+' by song number" viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'">'];
    for(const v of marks){
      const pos=y(v),label=mode==="host"||mode==="singer"?LABELS[mode][v]:String(Math.round(v));
      out.push('<line x1="'+left+'" y1="'+pos+'" x2="'+(width-right)+'" y2="'+pos+'" stroke="#2a5266" stroke-width="1" stroke-dasharray="3 5"/>');
      out.push('<text x="'+(left-9)+'" y="'+(pos+4)+'" fill="#9bbbc9" font-size="10" text-anchor="end">'+escapeHtml(label)+'</text>');
    }
    // Vertical separators indicate a recorded break between two song starts.
    for(const marker of model.markers){
      const pos=Math.min(width-right,Math.max(left, x(Math.max(0,marker.after-0.5))));
      out.push('<line x1="'+pos+'" y1="'+top+'" x2="'+pos+'" y2="'+plotBottom+'" stroke="#f3ae56" stroke-opacity=".85" stroke-dasharray="5 5" stroke-width="2"/>');
      out.push('<text x="'+pos+'" y="'+(top-7)+'" text-anchor="middle" fill="#f3ae56" font-size="10">Ⅱ</text>');
    }
    // Connect only adjacent songs with known values. Missing metrics never become zero.
    for(let i=1;i<data.length;i++){
      const a=data[i-1].metrics[mode],b=data[i].metrics[mode];
      if(a==null||b==null)continue;
      out.push('<line x1="'+x(i-1)+'" y1="'+y(a)+'" x2="'+x(i)+'" y2="'+y(b)+'" stroke="'+col+'" stroke-width="2.5" stroke-linecap="round" opacity=".85"/>');
    }
    for(let i=0;i<data.length;i++){
      const v=data[i].metrics[mode],px=x(i),py=v==null?plotBottom+3:y(v);
      out.push('<line x1="'+px+'" y1="'+(plotBottom+4)+'" x2="'+px+'" y2="'+(plotBottom+10)+'" stroke="#668da0"/>');
      out.push('<text x="'+px+'" y="'+(plotBottom+25)+'" fill="#adc5d1" font-size="11" text-anchor="middle">'+(i+1)+'</text>');
      out.push('<circle cx="'+px+'" cy="'+py+'" r="'+(v==null?4:6)+'" fill="'+(v==null?"#587180":col)+'" stroke="#031722" stroke-width="2"/>');
      const label=(i+1)+". "+data[i].title+" — "+valueLabel(mode,v);
      out.push('<circle class="night-flow-hit" tabindex="0" role="button" data-flow-index="'+i+'" aria-label="'+escapeHtml(label)+'" cx="'+px+'" cy="'+py+'" r="21" fill="transparent"/>');
    }
    out.push('<text x="'+(width/2)+'" y="'+(height-8)+'" fill="#98b6c8" font-size="11" text-anchor="middle">SONG ORDER →</text>');
    out.push('</svg>');
    return out.join("");
  }
  function card(){
    return '<section id="nightFlow" class="detail-section night-flow"><h3>NIGHT FLOW</h3><p class="night-flow-subtitle">How your set evolved, song by song</p><div class="night-flow-body">Loading chart…</div></section>';
  }
  function mount(root,played,breaks,formatTime){
    if(!root)return;
    const model=buildModel(played,breaks);
    const container=root.querySelector(".night-flow-body");
    if(!container)return;
    let mode="bpm",selected=-1;
    const when=ms=>ms>0?typeof formatTime==="function"?formatTime(new Date(ms)):new Date(ms).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"Time unavailable";
    function draw(){
      const oldScroll=container.querySelector(".night-flow-scroll")?.scrollLeft||0;
      const data=model.songs,svg=renderSvg(model,mode);
      const buttons=Object.entries(MODES).map(([key,obj])=>
        '<button type="button" class="night-flow-mode'+(key===mode?" is-active":"")+'" data-flow-mode="'+key+'" aria-pressed="'+(key===mode)+'">'+escapeHtml(obj.title)+'</button>').join("");
      let selectedSong=data[selected];
      if(!selectedSong&&data.length){
        selected=data.findIndex(song=>song.metrics[mode]!=null);
        if(selected<0)selected=0;
        selectedSong=data[selected];
      }
      const val=selectedSong?.metrics[mode]??null;
      const detail=selectedSong
        ?'<strong>#'+(selected+1)+' '+escapeHtml(selectedSong.title)+'</strong> <span>'+escapeHtml(selectedSong.artist)+
          ' · '+escapeHtml(when(selectedSong.time))+' · '+escapeHtml(MODES[mode].title)+': <b>'+escapeHtml(valueLabel(mode,val))+'</b></span>'
        :'<span>No played songs recorded for this session.</span>';
      const empty=data.length&&!svg?'<div class="night-flow-empty">No '+escapeHtml(MODES[mode].title.toLowerCase())+' data recorded for these songs.</div>':
        !data.length?'<div class="night-flow-empty">No played songs recorded for this session.</div>':'';
      container.innerHTML=
        '<div class="night-flow-toolbar" role="group" aria-label="Night Flow metric">'+buttons+'</div>'+
        '<div class="night-flow-summary"><span>'+data.length+' played songs · '+model.breakCount+' breaks</span><span>'+escapeHtml(summary(model,mode))+'</span></div>'+
        (svg?'<div class="night-flow-scroll" tabindex="0" aria-label="Scroll through chart by song order">'+svg+'</div>':'')+
        empty+(model.markers.length&&svg?'<p class="night-flow-legend"><span class="night-flow-break-key"></span> Recorded break</p>':'')+
        '<div class="night-flow-selected" aria-live="polite">'+detail+'</div>';
      const scroll=container.querySelector(".night-flow-scroll");
      if(scroll)scroll.scrollLeft=oldScroll;
    }
    container.addEventListener("click",event=>{
      const button=event.target.closest("[data-flow-mode]");
      if(button){mode=button.dataset.flowMode;selected=-1;draw();return;}
      const circle=event.target.closest("[data-flow-index]");
      if(circle){selected=Number(circle.dataset.flowIndex);draw();}
    });
    container.addEventListener("keydown",event=>{
      const point=event.target.closest("[data-flow-index]");
      if(point&&(event.key==="Enter"||event.key===" ")){
        event.preventDefault();selected=Number(point.dataset.flowIndex);
        const focused=selected;draw();
        container.querySelector('[data-flow-index="'+focused+'"]')?.focus();
      }
    });
    draw();
  }
  return {MODES,buildModel,valueOf,renderSvg,summary,card,mount};
});
