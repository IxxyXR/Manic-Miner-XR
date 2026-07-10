import * as THREE from "./vendor/three.module.min.js";
const BUILD_VERSION=new URL(import.meta.url).searchParams.get("v")??"dev";
const {readXrControls,updateXrViewState,XR_VIEW_DEFAULT}=await import(`./xr-input.js?v=${encodeURIComponent(BUILD_VERSION)}`);

const WIDTH=256,HEIGHT=192,FRAME_MS=20,MAX_PIXELS=WIDTH*HEIGHT;
const CONTROL_TEXT="VR: left stick moves · right stick gets nearer/orbits · right-stick click resets · trigger/A/X jumps · B/Y/Menu starts";
const DEPTH=Object.freeze({
  background:1,platform:22,wall:20,hazard:16,extra:14,scenery:3,
  surface:22,actor:2.5,boss:3,item:1.5,portal:2.5,effect:2,solarEffect:1.25,
  ui:1.25,title:2,titleBright:2.5
});
const palette=[[0,0,0],[0,0,.8],[.8,0,0],[.8,0,.8],[0,.8,0],[0,.8,.8],[.8,.8,0],[.8,.8,.8],[0,0,0],[0,0,1],[1,0,0],[1,0,1],[0,1,0],[0,1,1],[1,1,0],[1,1,1]];
const canvas=document.querySelector("#spectrum"),stageElement=document.querySelector("#stage"),status=document.querySelector("#status"),soundButton=document.querySelector("#sound");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.xr.enabled=true;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;

const scene=new THREE.Scene();scene.background=new THREE.Color(0x000000);scene.fog=new THREE.Fog(0x000000,360,620);
const xrCamera=new THREE.PerspectiveCamera(50,4/3,.1,1000);xrCamera.position.set(0,0,390);
const camera=new THREE.OrthographicCamera(-140,140,105,-105,.1,1000);camera.position.set(100,62,390);camera.lookAt(0,0,0);
const stage=new THREE.Group();scene.add(stage);
scene.add(new THREE.HemisphereLight(0x6688bb,0x08030d,1.35));
const keyLight=new THREE.DirectionalLight(0xffffff,2.4);keyLight.position.set(-100,130,180);scene.add(keyLight);
const rimLight=new THREE.DirectionalLight(0x3377ff,1.8);rimLight.position.set(150,-80,80);scene.add(rimLight);

const board=new THREE.Mesh(new THREE.BoxGeometry(WIDTH+8,HEIGHT+8,7),new THREE.MeshStandardMaterial({color:0x030308,roughness:.72,metalness:.15}));
board.position.z=-5;board.receiveShadow=true;stage.add(board);
const pixelGeometry=new THREE.BoxGeometry(1,1,1);
const colorObjects=palette.map(([r,g,b])=>new THREE.Color(r,g,b));
const MAX_PER_COLOR=20_000;
const colorMeshes=colorObjects.map((color,index)=>{
  if(index===0||index===8)return null;
  const front=new THREE.MeshBasicMaterial({color}),top=new THREE.MeshBasicMaterial({color:color.clone().multiplyScalar(.74)}),side=new THREE.MeshBasicMaterial({color:color.clone().multiplyScalar(.42)}),bottom=new THREE.MeshBasicMaterial({color:color.clone().multiplyScalar(.27)}),back=new THREE.MeshBasicMaterial({color:color.clone().multiplyScalar(.18)});
  const mesh=new THREE.InstancedMesh(pixelGeometry,[side,side,top,bottom,front,back],MAX_PER_COLOR);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;stage.add(mesh);return mesh;
});
const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion();

const wasm=await WebAssembly.instantiateStreaming(await fetch(`./src/manic_miner_core.wasm?v=${encodeURIComponent(BUILD_VERSION)}`),{});
const core=wasm.instance.exports,initResult=core.manic_init();
if(initResult!==0)throw new Error(`WASM core initialization failed (${initResult})`);
const screenPointer=core.manic_screen_ptr();
globalThis.__manic={core,colorMeshes,renderer,scene,stage,palette,updateRelief,applyXrView,buildVersion:BUILD_VERSION};
status.textContent="Select ENABLE SOUND, or click/tap the game, to allow audio";

let previous=performance.now(),accumulator=0,screenDirty=true,xrInput={left:false,right:false,jump:false,start:false},xrButtonsReady=false,xrGameStarted=false;
let audioContext=null,audioNode=null,audioGraphPromise=null,audioUnlockPromise=null,audioWorkletLoaded=false;
globalThis.__manic.audioState=()=>({state:audioContext?.state??"not-created",connected:!!audioNode,workletLoaded:audioWorkletLoaded,promptVisible:!soundButton.hidden});
function showAudioPrompt(message="Select ENABLE SOUND, or click/tap the game, to allow audio"){
  soundButton.hidden=false;if(!renderer.xr.isPresenting)status.textContent=message;
}
function ensureAudioContext(){
  if(audioContext)return audioContext;
  audioContext=new AudioContext({sampleRate:48_000,latencyHint:"interactive"});
  audioContext.addEventListener("statechange",()=>{
    if(audioContext.state==="running"&&audioNode){soundButton.hidden=true;if(!renderer.xr.isPresenting)status.textContent=CONTROL_TEXT}
    else showAudioPrompt(audioContext.state==="suspended"?"Audio paused — select ENABLE SOUND or press an XR trigger":"Audio unavailable — select ENABLE SOUND to retry");
  });
  return audioContext;
}
async function prepareAudioGraph(){
  const context=ensureAudioContext();if(audioNode)return audioNode;if(audioGraphPromise)return audioGraphPromise;
  audioGraphPromise=(async()=>{
    if(!audioWorkletLoaded){await context.audioWorklet.addModule(`./src/audio-worklet.js?v=${encodeURIComponent(BUILD_VERSION)}`);audioWorkletLoaded=true}
    const node=new AudioWorkletNode(context,"spectrum-beeper",{outputChannelCount:[2]});
    node.addEventListener("processorerror",()=>{console.error("[MMXR:AUDIO] Audio worklet processor stopped");node.disconnect();if(audioNode===node)audioNode=null;showAudioPrompt("Audio stopped — press an XR trigger or select ENABLE SOUND")});
    node.connect(context.destination);audioNode=node;
    if(context.state==="running"){soundButton.hidden=true;if(!renderer.xr.isPresenting)status.textContent=CONTROL_TEXT}
    return node;
  })();
  try{return await audioGraphPromise}finally{audioGraphPromise=null}
}
async function unlockAudio(){
  const context=ensureAudioContext();
  const resumePromise=context.resume();
  if(context.state==="running"&&audioNode){soundButton.hidden=true;return}
  if(audioUnlockPromise)return audioUnlockPromise;
  audioUnlockPromise=(async()=>{
    await Promise.all([resumePromise,prepareAudioGraph()]);
    await context.resume();if(context.state!=="running"||!audioNode)throw new Error(`Audio is incomplete (context ${context.state}, node ${audioNode?"connected":"missing"})`);
    soundButton.hidden=true;status.textContent=CONTROL_TEXT;
  })();
  try{await audioUnlockPromise}catch(error){console.error("[MMXR:AUDIO] Failed to enable audio",error);showAudioPrompt("Audio was blocked — press an XR trigger or select ENABLE SOUND to retry");throw error}finally{audioUnlockPromise=null}
}
function requestAudio(){unlockAudio().catch(()=>{})}
soundButton.addEventListener("click",requestAudio);
for(const type of["pointerdown","keydown"])addEventListener(type,requestAudio,{capture:true});
prepareAudioGraph().catch(error=>console.warn("[MMXR:AUDIO] Audio graph preload failed; will retry on interaction",error));
function sendAudio(){
  if(!audioNode)return;const length=core.manic_audio_len();if(!length)return;
  const samples=new Float32Array(core.memory.buffer,core.manic_audio_ptr(),length).slice();audioNode.port.postMessage(samples,[samples.buffer]);
}
function updateRelief(){
  const source=new Uint8Array(core.memory.buffer,screenPointer,MAX_PIXELS),cellDepth=new Float32Array(512),counts=new Uint32Array(16),staticAttrs=new Uint8Array(512),staticBitmap=new Uint8Array(4096);
  const air=core.manic_peek(0x80bc);
  let attributeMatches=0;for(let cell=0;cell<512;cell++)if(core.manic_peek(0x5800+cell)===core.manic_peek(0x5c00+cell))attributeMatches++;
  const gameplay=air>=0x24&&air<=0x3f&&attributeMatches>320;
  const semanticRects=[];
  let fallbackBase=DEPTH.surface,fallbackThickness=DEPTH.effect;
  if(gameplay){
    const cavern=core.manic_peek(0x8407);if(cavern===18){fallbackBase=DEPTH.hazard;fallbackThickness=DEPTH.solarEffect}
    const tileDepth=new Map();for(const[address,thickness]of[[0x8020,DEPTH.background],[0x8029,DEPTH.platform],[0x8032,DEPTH.platform],[0x803b,DEPTH.wall],[0x8044,DEPTH.platform],[0x804d,DEPTH.hazard],[0x8056,DEPTH.hazard],[0x805f,DEPTH.extra]]){const attribute=core.manic_peek(address);if(!tileDepth.has(attribute))tileDepth.set(attribute,thickness)}
    for(let cell=0;cell<512;cell++){const empty=core.manic_peek(0x5e00+cell);staticAttrs[cell]=empty;cellDepth[cell]=tileDepth.get(empty)??DEPTH.scenery}
    for(let byte=0;byte<4096;byte++)staticBitmap[byte]=core.manic_peek(0x7000+byte);
    const word=address=>core.manic_peek(address)|(core.manic_peek(address+1)<<8);
    const addCellRect=(address,width,height,base,thickness)=>{const offset=address-0x5c00;if(offset<0||offset>=512)return;const row=offset>>5,column=offset&31;semanticRects.push({left:column*8,top:row*8,right:column*8+width,bottom:row*8+height,base,thickness})};
    addCellRect(word(0x80b0),16,16,DEPTH.surface,DEPTH.portal);
    for(let item=0;item<5;item++){const address=0x8075+item*5;if(core.manic_peek(address)!==0xff)addCellRect(word(address+1),8,8,DEPTH.surface,DEPTH.item)}
    for(let guardian=0;guardian<4;guardian++){
      const address=0x80be+guardian*7,attribute=core.manic_peek(address);if(attribute===0xff)break;if(attribute===0)continue;
      const offset=word(address+1)-0x5c00,row=offset>>5,column=offset&31,frame=core.manic_peek(address+4)&3;
      semanticRects.push({left:column*8+frame*2,top:row*8,right:column*8+frame*2+16,bottom:row*8+16,base:DEPTH.surface,thickness:DEPTH.actor});
    }
    for(let guardian=0;guardian<4;guardian++){
      const address=0x80dd+guardian*7,attribute=core.manic_peek(address);if(attribute===0xff)break;if(attribute===0)continue;
      const top=core.manic_peek(address+2)&0x7f,left=core.manic_peek(address+3)*8;
      semanticRects.push({left,top,right:left+16,bottom:top+16,base:DEPTH.surface,thickness:DEPTH.actor});
    }
    const willyOffset=word(0x806c)-0x5c00,willyLeft=(willyOffset&31)*8+core.manic_peek(0x8069)*2,willyTop=core.manic_peek(0x8068)/2;
    semanticRects.push({left:willyLeft,top:willyTop,right:willyLeft+16,bottom:willyTop+16,base:DEPTH.surface,thickness:DEPTH.actor});
    if(cavern===4){const top=core.manic_peek(0x80dc);semanticRects.push({left:120,top,right:136,bottom:top+16,base:DEPTH.surface,thickness:DEPTH.boss})}
    if(cavern===7||cavern===11){const status=core.manic_peek(0x80db);if(status!==2){const top=status===0?0:core.manic_peek(0x80dc);semanticRects.push({left:120,top,right:136,bottom:top+16,base:DEPTH.surface,thickness:DEPTH.boss})}}
  }
  const depthCounts={};
  for(let y=0,index=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++,index++){
    const colorIndex=source[index]&15,mesh=colorMeshes[colorIndex];if(!mesh)continue;
    const instance=counts[colorIndex]++;if(instance>=MAX_PER_COLOR)continue;
    let base=0,thickness=y<128?(colorIndex>7?DEPTH.titleBright:DEPTH.title):DEPTH.ui;
    if(gameplay&&y<128){
      const cell=(y>>3)*32+(x>>3),attribute=staticAttrs[cell],bitmapOffset=((y&0x40)<<5)|((y&7)<<8)|((y&0x38)<<2)|(x>>3);
      const ink=(staticBitmap[bitmapOffset]&(0x80>>(x&7)))!==0,baseColor=ink?attribute&7:(attribute>>3)&7,expected=baseColor|((attribute&0x40)?8:0);
      thickness=cellDepth[cell];
      if(colorIndex!==expected){base=fallbackBase;thickness=fallbackThickness;for(const rect of semanticRects)if(x>=rect.left&&x<rect.right&&y>=rect.top&&y<rect.bottom){base=rect.base;thickness=rect.thickness}}
    }
    const layer=`${base}+${thickness}`;depthCounts[layer]=(depthCounts[layer]||0)+1;
    position.set(x-WIDTH/2+.5,HEIGHT/2-y-.5,base+thickness/2);scale.set(1,1,thickness);
    matrix.compose(position,quaternion,scale);mesh.setMatrixAt(instance,matrix);
  }
  for(let color=0;color<16;color++){const mesh=colorMeshes[color];if(!mesh)continue;mesh.count=Math.min(counts[color],MAX_PER_COLOR);mesh.instanceMatrix.needsUpdate=true}
  globalThis.__manic.depthCounts=depthCounts;
  screenDirty=false;
}

function setCoreKey(id,value){core.manic_key(id,value?1:0)}
function releaseXrInput(){for(const[name,id]of[["left",10],["right",25],["jump",35],["start",30]])if(xrInput[name])setCoreKey(id,false);xrInput={left:false,right:false,jump:false,start:false}}
function applyXrView(controls,seconds){const view=updateXrViewState({yaw:stage.rotation.y,z:stage.position.z},controls,seconds);stage.rotation.y=view.yaw;stage.position.z=view.z}
function pollXrInput(seconds){
  const session=renderer.xr.getSession();if(!session)return;
  const controls=readXrControls(session.inputSources),air=core.manic_peek(0x80bc);if(air>=0x24&&air<=0x3f)xrGameStarted=true;
  if(!xrButtonsReady){if(!controls.anyAction)xrButtonsReady=true;controls.jump=false;controls.start=false;controls.viewReset=false}
  applyXrView(controls,seconds);
  const next={left:controls.left,right:controls.right,jump:controls.jump,start:controls.start||(!xrGameStarted&&controls.jump)};
  for(const [name,id]of[["left",10],["right",25],["jump",35],["start",30]])if(next[name]!==xrInput[name])setCoreKey(id,next[name]);
  xrInput=next;
}
function animate(now){
  const elapsed=Math.min(100,now-previous);accumulator+=elapsed;previous=now;pollXrInput(elapsed/1000);
  while(accumulator>=FRAME_MS){core.manic_frame();sendAudio();accumulator-=FRAME_MS;screenDirty=true}
  if(screenDirty)updateRelief();renderer.render(scene,renderer.xr.isPresenting?xrCamera:camera);
}
renderer.setAnimationLoop(animate);

const spectrumIds=["ShiftLeft","KeyZ","KeyX","KeyC","KeyV","KeyA","KeyS","KeyD","KeyF","KeyG","KeyQ","KeyW","KeyE","KeyR","KeyT","Digit1","Digit2","Digit3","Digit4","Digit5","Digit0","Digit9","Digit8","Digit7","Digit6","KeyP","KeyO","KeyI","KeyU","KeyY","Enter","KeyL","KeyK","KeyJ","KeyH","Space","ShiftRight","KeyM","KeyN","KeyB"];
const keyIds=new Map(spectrumIds.map((code,id)=>[code,id]));keyIds.set("ArrowLeft",10);keyIds.set("ArrowRight",25);keyIds.set("ArrowUp",35);
for(const [type,pressed]of[["keydown",true],["keyup",false]])addEventListener(type,event=>{const id=keyIds.get(event.code);if(id===undefined)return;if(event.repeat&&pressed)return;setCoreKey(id,pressed);event.preventDefault()});
const touchPointers=new Map(),touchKeyCounts=new Map(),MIN_TOUCH_MS=FRAME_MS*2;
function finishTouchKey(id){const count=(touchKeyCounts.get(id)??1)-1;if(count>0)touchKeyCounts.set(id,count);else{touchKeyCounts.delete(id);setCoreKey(id,false)}}
function releaseTouchPointer(pointerId,immediate=false){
  const press=touchPointers.get(pointerId);if(!press)return;touchPointers.delete(pointerId);
  const delay=immediate?0:Math.max(0,MIN_TOUCH_MS-(performance.now()-press.started));
  if(delay)setTimeout(()=>finishTouchKey(press.id),delay);else finishTouchKey(press.id);
}
document.querySelectorAll("#touch button").forEach(button=>{
  const id=Number(button.dataset.key);
  button.addEventListener("pointerdown",event=>{
    if(touchPointers.has(event.pointerId))return;event.preventDefault();
    touchPointers.set(event.pointerId,{id,started:performance.now()});
    const count=touchKeyCounts.get(id)??0;touchKeyCounts.set(id,count+1);if(count===0)setCoreKey(id,true);
    try{button.setPointerCapture(event.pointerId)}catch(error){console.warn("[MMXR:TOUCH] Pointer capture unavailable",error)}
  });
  for(const type of["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,event=>{event.preventDefault();releaseTouchPointer(event.pointerId)});
  button.addEventListener("contextmenu",event=>event.preventDefault());
});
addEventListener("blur",()=>{for(const pointerId of[...touchPointers.keys()])releaseTouchPointer(pointerId,true)});

addEventListener("pointermove",event=>{if(renderer.xr.isPresenting)return;camera.position.x=100+(event.clientX/innerWidth-.5)*70;camera.position.y=62-(event.clientY/innerHeight-.5)*50;camera.lookAt(0,0,0)});
function resize(){const bounds=stageElement.getBoundingClientRect(),halfHeight=105,halfWidth=halfHeight*bounds.width/bounds.height;renderer.setSize(bounds.width,bounds.height,false);camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix()}
addEventListener("resize",resize);resize();

async function enableXr(){
  if(!navigator.xr||!await navigator.xr.isSessionSupported("immersive-vr"))return;
  const button=document.createElement("button");button.id="xr";button.textContent="ENTER VR";document.body.append(button);
  button.addEventListener("click",async()=>{
    requestAudio();button.disabled=true;let session=null;
    try{
      session=await navigator.xr.requestSession("immersive-vr",{optionalFeatures:["local-floor"]});
      session.addEventListener("select",requestAudio);
      try{await renderer.xr.setSession(session)}catch(error){await session.end().catch(()=>{});throw error}
    }catch(error){
      console.error("[MMXR:XR] Failed to enter VR",error);button.disabled=false;status.textContent=`VR unavailable: ${error.message}`;
    }
  });
  renderer.xr.addEventListener("sessionstart",()=>{requestAudio();releaseXrInput();xrButtonsReady=false;const air=core.manic_peek(0x80bc);xrGameStarted=air>=0x24&&air<=0x3f;stage.scale.setScalar(.009);stage.rotation.set(0,XR_VIEW_DEFAULT.yaw,0);stage.position.set(0,1.45,XR_VIEW_DEFAULT.z);status.hidden=true;button.hidden=true});
  renderer.xr.addEventListener("sessionend",()=>{releaseXrInput();xrButtonsReady=false;stage.scale.setScalar(1);stage.rotation.set(0,0,0);stage.position.set(0,0,0);status.textContent=audioContext?.state==="running"&&audioNode?CONTROL_TEXT:"Select ENABLE SOUND, or click/tap the game, to allow audio";status.hidden=false;button.disabled=false;button.hidden=false});
}
enableXr();
