const fs = require('fs')
let t = fs.readFileSync('lib/threeAI.cjs', 'utf8')
if (t.indexOf('stepBuild') >= 0) { console.log('already patched'); process.exit(0) }
const miss = []
function rep(a, b) { if (t.indexOf(a) < 0) { miss.push(a.slice(0, 60)); return } t = t.split(a).join(b) }
rep(`#err{position:fixed`, `#rp{position:fixed;top:10px;right:10px;background:#1a1a1f;color:#cfd0ea;border:1px solid #2e2e3a;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer}#err{position:fixed`)
rep(`<div id="err"></div><div id="hint">Drag to rotate - scroll to zoom</div>`, `<div id="err"></div><button id="rp">Replay build</button><div id="hint">Drag to rotate - scroll to zoom</div>`)
rep(`model.position.y-=box.min.y;scene.add(model);`, `model.position.y-=box.min.y;scene.add(model);
var parts=[];model.traverse(function(o){if(o.isMesh)parts.push(o)});
var fin=parts.map(function(o){return {s:o.scale.clone(),y:o.position.y}});
var N=parts.length,per=Math.max(30,Math.min(110,2600/Math.max(N,1))),t0=performance.now(),hn=document.getElementById('hint'),building=true;
parts.forEach(function(o){o.visible=false});
function stepBuild(now){var el=now-t0;for(var i=0;i<N;i++){var k=(el-i*per)/260,o=parts[i];if(k<=0){o.visible=false;continue}o.visible=true;if(k>=1){o.scale.copy(fin[i].s);o.position.y=fin[i].y}else{var e=1-Math.pow(1-k,3);o.scale.set(fin[i].s.x*e,fin[i].s.y*e,fin[i].s.z*e);o.position.y=fin[i].y+(1-e)*0.6}}
var done=Math.min(N,Math.floor(el/per)+1);hn.textContent=done<N?('Building part '+done+' of '+N):'Drag to rotate - scroll to zoom';return el>per*N+300}
document.getElementById('rp').onclick=function(){t0=performance.now();building=true};`)
rep(`if(auto)th+=0.006;cp();`, `if(building){building=!stepBuild(performance.now())}if(auto)th+=(building?0.012:0.006);cp();`)
if (miss.length) { console.log('MISSING: ' + miss.join(' || ')); process.exit(1) }
fs.writeFileSync('lib/threeAI.cjs', t)
console.log('patched ok')