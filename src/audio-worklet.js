class SpectrumBeeper extends AudioWorkletProcessor{
  constructor(){super();this.queue=[];this.offset=0;this.port.onmessage=event=>this.queue.push(event.data)}
  process(_inputs,outputs){
    const output=outputs[0],left=output[0],right=output[1]||output[0];
    for(let frame=0;frame<left.length;frame++){
      while(this.queue.length&&this.offset>=this.queue[0].length){this.queue.shift();this.offset=0}
      if(!this.queue.length){left[frame]=0;right[frame]=0;continue}
      const samples=this.queue[0];left[frame]=samples[this.offset++];right[frame]=samples[this.offset++];
    }
    return true;
  }
}
registerProcessor("spectrum-beeper",SpectrumBeeper);
