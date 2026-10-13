const fs = require('fs')
const f = 'lib/games/stealth.html'
let t = fs.readFileSync(f, 'utf8')
if (t.indexOf('function snd(') >= 0) { console.log('already patched'); process.exit(0) }
const miss = []
function rep(a, b) {
  if (a instanceof RegExp) { if (!a.test(t)) { miss.push(String(a).slice(0, 60)); return } t = t.replace(a, function () { return b }); return }
  if (t.indexOf(a) < 0) { miss.push(a.slice(0, 60)); return }
  t = t.split(a).join(b)
}
const AUDIO = `let AC=null,mo=null,NB=null,wv=null,muted=false,mus=0;
const GL=document.createElement('canvas');GL.width=GL.height=128;{const S=GL.getContext('2d'),g=S.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,200,110,.9)');g.addColorStop(1,'rgba(255,200,110,0)');S.fillStyle=g;S.fillRect(0,0,128,128)}
function audioStart(){try{if(!AC){AC=new(window.AudioContext||window.webkitAudioContext)();mo=AC.createGain();mo.gain.value=.9;mo.connect(AC.destination);const n=AC.sampleRate*2,buf=AC.createBuffer(1,n,AC.sampleRate),d=buf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;NB=buf;const s=AC.createBufferSource();s.buffer=buf;s.loop=true;const fl=AC.createBiquadFilter();fl.type='lowpass';fl.frequency.value=380;wv=AC.createGain();wv.gain.value=.05;s.connect(fl);fl.connect(wv);wv.connect(mo);s.start()}if(AC.state==='suspended')AC.resume()}catch(e){}}
function tn(f,d,ty,v,f2){if(!AC||muted)return;const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type=ty||'sine';o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(v||.08,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(mo);o.start(t);o.stop(t+d+.02)}
function nz(d,v,fq,ty){if(!AC||muted||!NB)return;const t=AC.currentTime,s=AC.createBufferSource(),fl=AC.createBiquadFilter(),g=AC.createGain();s.buffer=NB;fl.type=ty||'lowpass';fl.frequency.value=fq||1500;g.gain.setValueAtTime(v||.1,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(fl);fl.connect(g);g.connect(mo);s.start(t,Math.random(),d+.05)}
function snd(k){switch(k){case 'shot':nz(.09,.14,2600,'highpass');tn(200,.1,'triangle',.07,60);break;case 'eshot':nz(.14,.3,1800);tn(130,.18,'sawtooth',.1,50);break;case 'step':nz(.05,.05,420);break;case 'kill':nz(.18,.2,700);tn(110,.2,'sine',.12,40);break;case 'pick':[520,660,880].forEach((q,i)=>setTimeout(()=>tn(q,.14,'triangle',.08),i*90));break;case 'gad':tn(300,.25,'square',.05,900);break;case 'alarm':tn(880,.18,'square',.07);setTimeout(()=>tn(660,.18,'square',.07),180);break;case 'hit':tn(90,.2,'square',.12,40);nz(.1,.12,600);break;case 'reload':tn(1200,.04,'square',.04);setTimeout(()=>tn(800,.05,'square',.05),500);break;case 'win':[392,523,659,784].forEach((q,i)=>setTimeout(()=>tn(q,.3,'triangle',.1),i*140));break;case 'lose':[300,240,180,120].forEach((q,i)=>setTimeout(()=>tn(q,.35,'sawtooth',.08),i*180))}}
function music(dt){if(!AC||muted)return;mus-=dt;const alr=gs.some(g=>g.mode===2);if(wv)wv.gain.value=.04+.03*Math.sin(T*.6);if(mus<=0){mus=alr?.3:.75;tn(alr?98:55,alr?.2:.5,'sine',alr?.09:.06)}}
function guide(){let tg,s;if(!o[0]){tg={x:650,y:300};s='Sneak into the villa'}else if(!o[1]){if(!door.open){tg={x:650,y:190};s=dist(pl,{x:650,y:174})<260?'Press 1 near the red door':'Go to the red door'}else{tg={x:520,y:100};s='Stand on terminal, press E'}}else if(!o[2]){tg={x:gs[9].x,y:gs[9].y};s='Eliminate Voss'}else{tg={x:1515,y:670};s='Run to the pier'}
const sx=tg.x-cam.x,sy=tg.y-cam.y,p=1+.15*Math.sin(T*5);
if(sx>20&&sx<VW-20&&sy>20&&sy<VH-20){X.strokeStyle='#ffd25a';X.lineWidth=3;X.beginPath();X.arc(sx,sy,22*p,0,7);X.stroke();X.fillStyle='#ffd25a';X.beginPath();X.moveTo(sx,sy-34*p);X.lineTo(sx-8,sy-48*p);X.lineTo(sx+8,sy-48*p);X.fill()}
else{const a=Math.atan2(sy-VH/2,sx-VW/2),ex=cl(VW/2+Math.cos(a)*600,40,VW-40),ey=cl(VH/2+Math.sin(a)*600,40,VH-40);X.save();X.translate(ex,ey);X.rotate(a);X.fillStyle='#ffd25a';X.beginPath();X.moveTo(14,0);X.lineTo(-10,-10);X.lineTo(-10,10);X.fill();X.restore()}
rect(335,6,260,22,'#000a');txt('NEXT: '+s,465,22,'bold 12px system-ui','#ffd25a','center')}
function init(){`
rep('function init(){', AUDIO)
rep("L.fillStyle='rgba(3,7,20,.62)'", "L.fillStyle='rgba(8,16,40,.36)'")
rep("lamps.forEach(q=>lt(q[0],q[1],150,.9));lt(pl.x,pl.y,70,.5)", "lamps.forEach(q=>lt(q[0],q[1],230,1));lt(pl.x,pl.y,120,.7)")
rep("X.drawImage(lc,0,0)}", "X.drawImage(lc,0,0);const vg=X.createRadialGradient(480,300,230,480,300,600);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.55)');X.fillStyle=vg;X.fillRect(0,0,VW,VH)}")
rep("rect(0,0,WW,WH,'#17221c');rect(540,330,640,640,'#34353a');", "rect(0,0,WW,WH,'#2a4a30');for(let i=0;i<60;i++){circ((i*397)%WW,(i*211)%WH,26+(i%5)*6,'#2f5535')}rect(540,330,640,640,'#6a645a');")
rep("'#ffffff12'", "'#00000018'")
rep("rect(300,40,700,260,'#2a241f');rect(310,50,680,120,'#3b2026');", "rect(300,40,700,260,'#6b5a48');rect(310,50,680,120,'#8a3f4c');for(let i=310;i<990;i+=34)rect(i,50,1,120,'#0003');")
rep("'#1f4a28'", "'#2f7a3d'")
rep("'#2f6b3a'", "'#46a057'")
rep("circ(t[0],t[1],24,'#0d2216');circ(t[0],t[1],15,'#14301f')", "circ(t[0],t[1],24,'#14381f');circ(t[0],t[1],15,'#1f5a30')")
rep("lamps.forEach(q=>circ(q[0],q[1],3,'#ffd98a'));", "X.globalCompositeOperation='lighter';lamps.forEach(q=>{X.globalAlpha=.4;X.drawImage(GL,q[0]-110,q[1]-110,220,220)});X.globalAlpha=1;X.globalCompositeOperation='source-over';lamps.forEach(q=>circ(q[0],q[1],3,'#fff2c0'));")
rep("function shoot(){pl.mag--;", "function shoot(){snd('shot');pl.mag--;")
rep("noise(g.x,g.y,260)}", "noise(g.x,g.y,260);snd('eshot')}")
rep("pl.ft=.45;noise(pl.x,pl.y,75)", "pl.ft=.45;noise(pl.x,pl.y,75);snd('step')")
rep("g.mode=3;noise(g.x,g.y,40);tk++;", "g.mode=3;noise(g.x,g.y,40);tk++;snd('kill');")
rep("o[1]=1;comm(", "o[1]=1;snd('pick');comm(")
rep("if(i===3)jam=10;gc[i]=GM[i]}", "if(i===3)jam=10;gc[i]=GM[i];snd('gad')}")
rep("function alarm(g){al++;", "function alarm(g){al++;snd('alarm');")
rep("pl.hp-=10;shake=.2;", "pl.hp-=10;shake=.2;snd('hit');")
rep("function end(w){st='over';", "function end(w){st='over';snd(w?'win':'lose');")
rep("if(g.hp<=0)g.mode=3;else{", "if(g.hp<=0){g.mode=3;snd('kill')}else{")
rep("else if(pl.res>0)pl.rl=1.2}", "else if(pl.res>0){pl.rl=1.2;snd('reload')}}")
rep("if(K.r&&pl.mag<7&&pl.res>0)pl.rl=1.2}}", "if(K.r&&pl.mag<7&&pl.res>0){pl.rl=1.2;snd('reload')}}}")
rep("$('go').onclick=()=>{init();st='play';", "$('go').onclick=()=>{audioStart();init();st='play';")
rep("function update(dt){T+=dt;", "function update(dt){T+=dt;music(dt);")
rep("if(k==='e')act();", "if(k==='e')act();if(k==='m'){muted=!muted;say(muted?'Sound off':'Sound on')}")
rep("txt('ALERT',480,34,'bold 18px system-ui','#ff5050','center')}", "txt('ALERT',480,34,'bold 18px system-ui','#ff5050','center')}guide();")
rep(/<p>WASD move[^<]*<\/p>/, "<p style='text-align:left;display:inline-block;line-height:1.7'><b>MOVE</b> W A S D &nbsp; <b>SNEAK</b> hold Shift &nbsp; <b>SOUND</b> M<br><b>AIM</b> mouse &nbsp; <b>SHOOT</b> click (7 bullets, R reloads)<br><b>TAKEDOWN</b> E next to an unaware guard<br><b>GADGETS</b> 1 hack door · 2 EMP · 3 grapple dash · 4 camera jam</p><p><b>GOAL:</b> 1 Sneak into the villa · 2 Press <b>1</b> at the red door · 3 Press <b>E</b> on the glowing terminal · 4 Shoot Voss · 5 Run to the pier on the right</p>")
if (miss.length) { console.log('MISSING: ' + miss.join(' || ')); process.exit(1) }
fs.writeFileSync(f, t)
console.log('patched ok')