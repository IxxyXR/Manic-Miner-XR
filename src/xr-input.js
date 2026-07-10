function pressed(gamepad,index){
  const button=gamepad.buttons[index];return !!button&&(button.pressed||button.value>.5);
}
function deadzone(value){return Math.abs(value)<.2?0:value}

export const XR_VIEW_DEFAULT=Object.freeze({yaw:0,z:-2.25});
export function updateXrViewState(view,controls,seconds){
  if(controls.viewReset)return{...XR_VIEW_DEFAULT};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  return {yaw:clamp(view.yaw+controls.viewX*.75*seconds,-.55,.55),z:clamp(view.z-controls.viewY*1.25*seconds,-3.8,-.75)};
}

export function readXrControls(inputSources){
  const sources=Array.from(inputSources).filter(source=>source.gamepad),hasMenuLayout=sources.some(source=>source.gamepad.buttons.length>=8);
  let horizontal=0,viewX=0,viewY=0,jump=false,start=false,viewReset=false;
  for(const [index,source]of sources.entries()){
    const gamepad=source.gamepad;if(!gamepad)continue;
    const x=deadzone(Number.isFinite(gamepad.axes[2])?gamepad.axes[2]:(gamepad.axes[0]??0)),y=deadzone(Number.isFinite(gamepad.axes[3])?gamepad.axes[3]:(gamepad.axes[1]??0));
    const unknownHand=source.handedness!=="left"&&source.handedness!=="right",inferredRight=unknownHand&&(hasMenuLayout?gamepad.buttons.length<8:sources.length>1&&index===sources.length-1);
    if(source.handedness==="right"||inferredRight){viewX=x;viewY=y;viewReset ||= pressed(gamepad,3)}
    else if(Math.abs(x)>Math.abs(horizontal))horizontal=x;
    jump ||= pressed(gamepad,0)||pressed(gamepad,4);
    start ||= pressed(gamepad,5)||pressed(gamepad,7);
  }
  return {left:horizontal<-.25,right:horizontal>.25,jump,start,viewX,viewY,viewReset,anyAction:jump||start||viewReset};
}
