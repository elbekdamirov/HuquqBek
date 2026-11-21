class HuquqBekCapture extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.position=0;this.ratio=sampleRate/16000;this.pcm=[];this.port.onmessage=e=>{if(e.data==='flush'){if(this.pcm.length){const pcm=new Int16Array(this.pcm);this.pcm=[];this.port.postMessage(pcm.buffer,[pcm.buffer]);}this.port.postMessage({flushed:true});}};}
  process(inputs){
    const input=inputs[0];if(!input?.[0])return true;
    for(let i=0;i<input[0].length;i++){let s=0;for(const channel of input)s+=channel[i];this.samples.push(s/input.length);}
    while(this.position+1<this.samples.length){const i=Math.floor(this.position),f=this.position-i;const s=this.samples[i]*(1-f)+this.samples[i+1]*f;this.pcm.push(Math.round(Math.max(-1,Math.min(1,s))* (s<0?32768:32767)));this.position+=this.ratio;}
    const drop=Math.floor(this.position);this.samples.splice(0,drop);this.position-=drop;
    if(this.pcm.length>=1600){const pcm=new Int16Array(this.pcm);this.pcm=[];this.port.postMessage(pcm.buffer,[pcm.buffer]);}
    return true;
  }
}
registerProcessor('huquqbek-capture',HuquqBekCapture);
