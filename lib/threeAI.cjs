const vm = require('vm')
const sh = require('./shape3d.cjs')
const MODELS = [process.env.GROQ_GAME_AI_MODEL || 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
const VISION = process.env.GROQ_VISION_MODEL || process.env.VISION_MODEL || 'qwen/qwen3.8-27b' || (function () { try { return require('fs').readFileSync(require('path').join(__dirname, 'vision-model.txt'), 'utf8').trim() } catch (e) { return '' } })() || 'meta-llama/llama-4-scout-17b-16e-instruct'

const SYS = require('fs').readFileSync(require('path').join(__dirname, 'prompt3d.txt'), 'utf8')

const SHELL = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<style>html,body{margin:0;height:100%;background:#0d0d0c;overflow:hidden;font-family:system-ui,sans-serif}#hint{position:fixed;left:0;right:0;bottom:10px;text-align:center;color:#9a9aa5;font-size:12px;pointer-events:none}#rp{position:fixed;top:10px;right:10px;background:#1a1a1f;color:#cfd0ea;border:1px solid #2e2e3a;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer}#err{position:fixed;top:10px;left:10px;right:10px;color:#e88;font-size:12px}</style></head><body>
<div id="err"></div><button id="rp">Replay build</button><div id="hint">Drag to rotate - scroll to zoom</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
function buildModel(THREE){
__BODY__
}
(function(){
var er=document.getElementById('err');
if(typeof THREE==='undefined'){er.textContent='3D library failed to load. Check your internet.';return}
var scene=new THREE.Scene();scene.background=new THREE.Color(0x0d0d0c);
var cam=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,100);
var ren=new THREE.WebGLRenderer({antialias:true});ren.setPixelRatio(Math.min(devicePixelRatio,2));ren.setSize(innerWidth,innerHeight);document.body.appendChild(ren.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x333344,0.9));
var dl=new THREE.DirectionalLight(0xffffff,0.8);dl.position.set(5,8,5);scene.add(dl);
scene.add(new THREE.GridHelper(10,20,0x7C83DB,0x2a2a35));
var model;try{model=buildModel(THREE)}catch(e){model=new THREE.Group();er.textContent='Model error: '+e.message}
var box=new THREE.Box3().setFromObject(model);var sz=box.getSize(new THREE.Vector3());var mx=Math.max(sz.x,sz.y,sz.z)||1;model.scale.setScalar(3/mx);
box=new THREE.Box3().setFromObject(model);var c=box.getCenter(new THREE.Vector3());model.position.x-=c.x;model.position.z-=c.z;model.position.y-=box.min.y;scene.add(model);
var parts=[];model.traverse(function(o){if(o.isMesh)parts.push(o)});
var fin=parts.map(function(o){return {s:o.scale.clone(),y:o.position.y}});
var N=parts.length,per=Math.max(30,Math.min(110,2600/Math.max(N,1))),t0=performance.now(),hn=document.getElementById('hint'),building=true;
parts.forEach(function(o){o.visible=false});
function stepBuild(now){var el=now-t0;for(var i=0;i<N;i++){var k=(el-i*per)/260,o=parts[i];if(k<=0){o.visible=false;continue}o.visible=true;if(k>=1){o.scale.copy(fin[i].s);o.position.y=fin[i].y}else{var e=1-Math.pow(1-k,3);o.scale.set(fin[i].s.x*e,fin[i].s.y*e,fin[i].s.z*e);o.position.y=fin[i].y+(1-e)*0.6}}
var done=Math.min(N,Math.floor(el/per)+1);hn.textContent=done<N?('Building part '+done+' of '+N):'Drag to rotate - scroll to zoom';return el>per*N+300}
document.getElementById('rp').onclick=function(){t0=performance.now();building=true};
var th=0.8,ph=1.1,d=7,auto=true,drag=false,lx=0,ly=0;
function cp(){cam.position.set(d*Math.sin(ph)*Math.sin(th),d*Math.cos(ph)+1.2,d*Math.sin(ph)*Math.cos(th));cam.lookAt(0,1.2,0)}
var el=ren.domElement;el.style.touchAction='none';
el.addEventListener('pointerdown',function(e){drag=true;auto=false;lx=e.clientX;ly=e.clientY});
addEventListener('pointerup',function(){drag=false});
addEventListener('pointermove',function(e){if(!drag)return;th-=(e.clientX-lx)*0.01;ph=Math.max(0.2,Math.min(1.5,ph-(e.clientY-ly)*0.01));lx=e.clientX;ly=e.clientY});
el.addEventListener('wheel',function(e){e.preventDefault();d=Math.max(3,Math.min(14,d+e.deltaY*0.005))},{passive:false});
addEventListener('resize',function(){cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();ren.setSize(innerWidth,innerHeight)});
(function loop(){requestAnimationFrame(loop);if(building){building=!stepBuild(performance.now())}if(auto)th+=(building?0.012:0.006);cp();ren.render(scene,cam)})();
})();
</script></body></html>`

function clean(s, max) {
  return String(s || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function chat(model, messages, max) {
  const key = process.env.GROQ_API_KEY
  if (!key) return { ok: false, status: 0 }
  const ctl = new AbortController()
  const t = setTimeout(function () { ctl.abort() }, 45000)
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: model, messages: messages, temperature: 0.5, max_tokens: max })
    })
    const j = await r.json().catch(function () { return {} })
    if (!r.ok) return { ok: false, status: r.status }
    const c = j.choices && j.choices[0]
    return { ok: true, text: (c && c.message && c.message.content) || '', finish: c && c.finish_reason }
  } catch (e) {
    return { ok: false, status: 0 }
  } finally {
    clearTimeout(t)
  }
}

async function describe(image) {
  if (!image || String(image).indexOf('data:image') !== 0) return ''
  const msgs = [{ role: 'user', content: [
    { type: 'text', text: 'Describe this object for a 3D modeler: overall shape, each main part with relative size and position, and colors. Max 150 words.' },
    { type: 'image_url', image_url: { url: image } }
  ] }]
  const r = await chat(VISION, msgs, 400)
  if (!r.ok) console.log('[threeAI] vision failed status=' + r.status + ' model=' + VISION)
  return r.ok ? clean(r.text, 900) : ''
}

function deep() {
  const f = function () {}
  return new Proxy(f, {
    get: function (t, k) { return k === Symbol.toPrimitive ? function () { return 0 } : deep() },
    apply: function () { return deep() },
    construct: function () { return deep() },
    set: function () { return true }
  })
}

function bodyOK(body) {
  if (!/return\s+group/.test(body)) return 'missing return group'
  if (/^\s*function\b/.test(body)) return 'do not wrap in a function'
  try {
    new vm.Script('(function(THREE){' + body + '\n})')
    new vm.Script('(function(THREE){' + body + '\n})(THREE)').runInNewContext({ THREE: deep(), Math: Math }, { timeout: 1000 })
  } catch (e) { return String(e.message).slice(0, 160) }
  return null
}

async function generate3D(userText, image) {
  const desc = await describe(image)
  if (image && !desc) return { ok: false }
  const shape = await sh.planShape(userText, desc, chat, MODELS)
  let mi = 0
  let hint = ''
  const subject = clean(userText, 300)
  const name = clean(subject.replace(/^(please\s+)?(build|make|create|generate|design|show)( me)?( an?| the)?\s*/i, ''), 40).replace(/^(3d|three\.?js)\s*(image|model|object|version)?\s*(of|for)?\s*/i, '') || '3D Model'
  for (let attempt = 0; attempt < 3; attempt++) {
    const q = 'Build this 3D object: ' + subject + (shape ? '\nPlan of the real object:\n' + shape : '') + (desc ? '\nPhoto description: ' + desc : '') + hint
    const r = await chat(MODELS[mi], [{ role: 'system', content: SYS }, { role: 'user', content: q }], 4000)
    if (!r.ok) { console.log('[threeAI] attempt ' + attempt + ' groq failed status=' + r.status); mi = 1; continue }
    if (r.finish === 'length') { hint = '\nUse fewer parts. The last answer was cut off.'; continue }
    let body = String(r.text || '').trim()
    const f = body.match(/```(?:javascript|js)?[ \t]*\r?\n([\s\S]*?)```/i)
    if (f) body = f[1].trim()
    body = body.replace(/<\/script/gi, '')
    const err = bodyOK(body)
    if (err) { console.log('[threeAI] attempt ' + attempt + ' failed check: ' + err); hint = '\nYour previous code failed: ' + err + '. Output the corrected function body only.'; continue }
    const html = SHELL.replace('__TITLE__', function () { return name }).replace('__BODY__', function () { return body })
    return { ok: true, html: html, name: (/^(this|it|that|image|photo|picture|pic)\b/i.test(name) ? '3D Model' : name), headline: '3D model ready', help: 'Drag to rotate, scroll to zoom.' }
  }
  return { ok: false }
}

module.exports = { generate3D }