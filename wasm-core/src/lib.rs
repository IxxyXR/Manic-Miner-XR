use core::time::Duration;
use rustzx_core::{
    poke::{Poke,PokeAction},
    host::{BufferCursor,FrameBuffer,FrameBufferSource,Host,HostContext,Snapshot,Stopwatch,StubDebugInterface,StubIoExtender},
    zx::{keys::ZXKey,machine::ZXMachine,video::colors::{ZXBrightness,ZXColor}},
    EmulationMode,Emulator,RustzxSettings,
};

const SNAPSHOT:&[u8]=include_bytes!("../../generated/ManicMiner.sna");
#[derive(Clone)]pub struct FrameContext;
pub struct IndexedFrameBuffer{pixels:Vec<u8>}
impl FrameBuffer for IndexedFrameBuffer{
    type Context=FrameContext;
    fn new(width:usize,height:usize,_:FrameBufferSource,_:Self::Context)->Self{Self{pixels:vec![0;width*height]}}
    fn set_color(&mut self,x:usize,y:usize,color:ZXColor,brightness:ZXBrightness){self.pixels[y*256+x]=u8::from(color)|((brightness as u8)<<3)}
}
impl IndexedFrameBuffer{fn pixels(&self)->&[u8]{&self.pixels}}

pub struct ZeroStopwatch;
impl Stopwatch for ZeroStopwatch{fn new()->Self{Self}fn measure(&self)->Duration{Duration::ZERO}}
pub struct BrowserHost;pub struct BrowserContext;
impl Host for BrowserHost{
    type Context=BrowserContext;type DebugInterface=StubDebugInterface;type EmulationStopwatch=ZeroStopwatch;
    type FrameBuffer=IndexedFrameBuffer;type IoExtender=StubIoExtender;type TapeAsset=BufferCursor<&'static[u8]>;
}
impl HostContext<BrowserHost> for BrowserContext{fn frame_buffer_context(&self)->FrameContext{FrameContext}}

struct CoreState{emulator:Emulator<BrowserHost>,audio:Vec<f32>}
struct MemoryPoke([PokeAction;1]);
impl Poke for MemoryPoke{fn actions(&self)->&[PokeAction]{&self.0}}
static mut STATE:*mut CoreState=core::ptr::null_mut();
unsafe fn state()->Option<&'static CoreState>{let pointer=STATE;pointer.as_ref()}
unsafe fn state_mut()->Option<&'static mut CoreState>{let pointer=STATE;pointer.as_mut()}

#[no_mangle]pub extern "C" fn manic_init()->i32{
    let settings=RustzxSettings{machine:ZXMachine::Sinclair48K,emulation_mode:EmulationMode::FrameCount(1),tape_fastload_enabled:false,kempston_enabled:true,mouse_enabled:false,beeper_enabled:true,sound_enabled:true,sound_volume:100,sound_sample_rate:48_000,load_default_rom:true};
    let mut emulator=match Emulator::<BrowserHost>::new(settings,BrowserContext){Ok(value)=>value,Err(_)=>return 1};
    if emulator.load_snapshot(Snapshot::Sna(BufferCursor::new(SNAPSHOT))).is_err(){return 2}
    unsafe{if !STATE.is_null(){drop(Box::from_raw(STATE))}STATE=Box::into_raw(Box::new(CoreState{emulator,audio:Vec::with_capacity(1920)}))}0
}
#[no_mangle]pub extern "C" fn manic_frame()->i32{unsafe{
    let Some(value)=state_mut()else{return 2};value.audio.clear();
    if value.emulator.emulate_frames(Duration::ZERO).is_err(){return 1}
    while let Some(sample)=value.emulator.next_audio_sample(){value.audio.push(sample.left);value.audio.push(sample.right)}0
}}
#[no_mangle]pub extern "C" fn manic_screen_ptr()->*const u8{unsafe{state().map_or(core::ptr::null(),|value|value.emulator.screen_buffer().pixels().as_ptr())}}
#[no_mangle]pub extern "C" fn manic_audio_ptr()->*const f32{unsafe{state().map_or(core::ptr::null(),|value|value.audio.as_ptr())}}
#[no_mangle]pub extern "C" fn manic_audio_len()->u32{unsafe{state().map_or(0,|value|value.audio.len()as u32)}}
#[no_mangle]pub extern "C" fn manic_peek(address:u32)->u32{unsafe{state().map_or(0,|value|u32::from(value.emulator.peek(address as u16)))}}
#[no_mangle]pub extern "C" fn manic_poke(address:u32,byte:u32){unsafe{if let Some(value)=state_mut(){value.emulator.execute_poke(MemoryPoke([PokeAction::mem(address as u16,byte as u8)]))}}}
#[no_mangle]pub extern "C" fn manic_key(key:u32,pressed:u32){
    use ZXKey::*;
    let key=match key{0=>Shift,1=>Z,2=>X,3=>C,4=>V,5=>A,6=>S,7=>D,8=>F,9=>G,10=>Q,11=>W,12=>E,13=>R,14=>T,15=>N1,16=>N2,17=>N3,18=>N4,19=>N5,20=>N0,21=>N9,22=>N8,23=>N7,24=>N6,25=>P,26=>O,27=>I,28=>U,29=>Y,30=>Enter,31=>L,32=>K,33=>J,34=>H,35=>Space,36=>SymShift,37=>M,38=>N,39=>B,_=>return};
    unsafe{if let Some(value)=state_mut(){value.emulator.send_key(key,pressed!=0)}}
}
