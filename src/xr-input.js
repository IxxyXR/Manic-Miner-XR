function pressed(gamepad,index){
  const button=gamepad.buttons[index];return !!button&&(button.pressed||button.value>.5);
}

export function readXrControls(inputSources){
  let horizontal=0,jump=false,start=false;
  for(const source of inputSources){
    const gamepad=source.gamepad;if(!gamepad)continue;
    const candidate=Number.isFinite(gamepad.axes[2])?gamepad.axes[2]:(gamepad.axes[0]??0);
    if(Math.abs(candidate)>Math.abs(horizontal))horizontal=candidate;
    jump ||= pressed(gamepad,0)||pressed(gamepad,4);
    start ||= pressed(gamepad,5)||pressed(gamepad,7);
  }
  return {left:horizontal<-.25,right:horizontal>.25,jump,start,anyAction:jump||start};
}
