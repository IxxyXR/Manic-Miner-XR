import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {readXrControls,updateXrViewState,XR_VIEW_DEFAULT} from "../src/xr-input.js";

const wasmBytes=readFileSync(new URL("../src/manic_miner_core.wasm",import.meta.url));
async function core(){const {instance}=await WebAssembly.instantiate(wasmBytes,{});assert.equal(instance.exports.manic_init(),0);return instance.exports}
function frames(core,count){for(let frame=0;frame<count;frame++)assert.equal(core.manic_frame(),0)}
async function enterCentralCavern(){const value=await core();frames(value,5);value.manic_key(30,1);frames(value,20);value.manic_key(30,0);frames(value,70);return value}
function tap(core,key){core.manic_key(key,1);frames(core,18);core.manic_key(key,0);frames(core,18)}
function cavernName(core){return String.fromCharCode(...Array.from({length:32},(_,index)=>core.manic_peek(0x8000+index))).trim()}
function teleport(core,cavern){const keys=[24];for(let bit=0;bit<5;bit++)if(cavern&(1<<bit))keys.push(15+bit);for(const key of keys)core.manic_key(key,1);frames(core,30);for(const key of keys)core.manic_key(key,0);frames(core,30)}
function xrSource({handedness="left",axes=[0,0,0,0],buttons=[]}={}){return{handedness,gamepad:{axes,buttons:Array.from({length:8},(_,index)=>({pressed:buttons.includes(index),value:buttons.includes(index)?1:0}))}}}

test("Quest controls map thumbsticks, action buttons, and Start",()=>{
  const movement=readXrControls([xrSource({axes:[0,0,-.8,0]}),xrSource({handedness:"right",axes:[0,0,.5,-.7],buttons:[3]})]);
  assert.deepEqual(movement,{left:true,right:false,jump:false,start:false,viewX:.5,viewY:-.7,viewReset:true,anyAction:true});
  const actions=readXrControls([xrSource({buttons:[0,5]}),xrSource({handedness:"right",buttons:[4]})]);
  assert.equal(actions.jump,true);assert.equal(actions.start,true);assert.equal(actions.anyAction,true);
});
test("right-stick view motion is clamped and resettable",()=>{
  const nearer=updateXrViewState(XR_VIEW_DEFAULT,{viewX:.4,viewY:-1,viewReset:false},1);
  assert.ok(Math.abs(nearer.yaw-.3)<1e-9);assert.equal(nearer.z,-1);
  assert.deepEqual(updateXrViewState(nearer,{viewX:0,viewY:0,viewReset:true},1),XR_VIEW_DEFAULT);
});

test("snapshot enters the original title routine",async()=>{
  const value=await core();frames(value,10);
  const screen=new Uint8Array(value.memory.buffer,value.manic_screen_ptr(),256*192);
  assert.ok(screen.reduce((count,pixel)=>count+((pixel&7)!==0),0)>30_000);
});
test("the untouched title sequence enters the original demo mode",async()=>{
  const value=await core();let frame=0;
  while(value.manic_peek(0x845a)===0&&frame<3_000){value.manic_frame();frame++}
  assert.equal(value.manic_peek(0x845a),0x40);assert.equal(value.manic_peek(0x8407),0);assert.equal(cavernName(value),"Central Cavern");
});
test("the original beeper produces one stereo audio block per frame",async()=>{
  const value=await core();frames(value,10);const length=value.manic_audio_len();assert.equal(length,1920);
  const samples=new Float32Array(value.memory.buffer,value.manic_audio_ptr(),length);assert.ok(samples.some(sample=>sample!==0));
});
test("Enter initializes the source-defined Central Cavern state",async()=>{
  const value=await enterCentralCavern();
  const name=String.fromCharCode(...Array.from({length:32},(_,index)=>value.manic_peek(0x8000+index)));
  assert.equal(name,"         Central Cavern         ");assert.equal(value.manic_peek(0x8068),0xd0);assert.equal(value.manic_peek(0x806c),0xa2);
});
test("movement and jumping use the original Spectrum input path",async()=>{
  const value=await enterCentralCavern();value.manic_key(25,1);frames(value,20);value.manic_key(25,0);assert.equal(value.manic_peek(0x806c),0xa3);
  value.manic_key(35,1);frames(value,8);value.manic_key(35,0);assert.equal(value.manic_peek(0x806b),1);assert.ok(value.manic_peek(0x8068)<0xd0);
});
test("air exhaustion loses a life and reinitializes the original cavern",async()=>{
  const value=await enterCentralCavern(),initialLives=value.manic_peek(0x8457);let frame=0;
  while(value.manic_peek(0x8457)===initialLives&&frame<9_000){value.manic_frame();frame++}
  assert.equal(value.manic_peek(0x8457),initialLives-1);assert.equal(cavernName(value),"Central Cavern");
  assert.equal(value.manic_peek(0x8068),0xd0);assert.equal(value.manic_peek(0x806c),0xa2);assert.equal(value.manic_peek(0x80bc),0x3f);
});
test("the original 6031769 mechanism initializes special caverns",async()=>{
  const value=await enterCentralCavern();for(const key of[24,20,17,15,23,24,21])tap(value,key);assert.equal(value.manic_peek(0x845d),7);
  teleport(value,7);assert.equal(cavernName(value),"Miner Willy meets the Kong Beast");
  teleport(value,18);assert.equal(cavernName(value),"Solar Power Generator");
  teleport(value,19);assert.equal(cavernName(value),"The Final Barrier");
});
test("entering an opened portal runs the original next-cavern transition",async()=>{
  const value=await enterCentralCavern(),portal=value.manic_peek(0x80b0)|(value.manic_peek(0x80b1)<<8);
  value.manic_poke(0x808f,value.manic_peek(0x808f)|0x80);value.manic_poke(0x806c,portal&0xff);value.manic_poke(0x806d,portal>>8);
  let frame=0;while(cavernName(value)!=="The Cold Room"&&frame<1_000){value.manic_frame();frame++}
  assert.equal(value.manic_peek(0x8407),1);assert.equal(cavernName(value),"The Cold Room");
});
