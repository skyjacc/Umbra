// Native Chromium checks of graph coefficients and the shipped AudioWorklet signal path.
// npm ci; npx playwright install chromium; npm run test:audio
// Optional UMBRA_PLAYWRIGHT_PATH / UMBRA_AUDIT_CHROMIUM select an existing local installation.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.UMBRA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.UMBRA_PLAYWRIGHT_PATH).href : 'playwright');
const audio = ts.transpileModule(await fs.readFile(path.join(root, 'src/lib/audio.ts'), 'utf8'), {
  compilerOptions: {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}
}).outputText.replace(/^export /gm, '');
const engine = (await fs.readFile(path.join(root,'public/offscreen.js'),'utf8')).split(/\/\/ Capture\r?\n/)[0];
const server = http.createServer(async (req,res) => {
  const name = req.url?.slice(1);
  if (!['limiter-core.js','limiter-worklet.js'].includes(name)) {
    res.writeHead(200,{'Content-Type':'text/html'}); res.end('<!doctype html><title>Audio check</title>'); return;
  }
  res.writeHead(200,{'Content-Type':'application/javascript'});
  res.end(await fs.readFile(path.join(root,'public',name)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({headless:true,...(process.env.UMBRA_AUDIT_CHROMIUM ? {executablePath:process.env.UMBRA_AUDIT_CHROMIUM}: {})});
  const page = await browser.newPage();
  await page.goto(base);
  const result = await page.evaluate(async ({audio,engine,base}) => {
    const math = new Function(audio+';return {biquadCoefficients,bandDbAtY,masterGainToDb,dbToMasterGain};')();
    let maxResponseError = 0;
    let worstResponse;
    let comparisons=0;
    for(const sampleRate of [44100,48000,96000]) {
      const context = new OfflineAudioContext(2,128,sampleRate);
      for(const type of ['peaking','lowshelf','highshelf']) for(const gain of [-30,-12,0,6,30]) for(const frequency of [5,20,1000,20000,22000]) for(const q of [.2,.7071,11]) {
        const node=context.createBiquadFilter();node.type=type;node.frequency.value=frequency;node.gain.value=gain;node.Q.value=q;
        const frequencies=new Float32Array([0,5,20,50,500,1000,2000,10000,20000]);
        const mags=new Float32Array(frequencies.length);node.getFrequencyResponse(frequencies,mags,new Float32Array(frequencies.length));
        const c=math.biquadCoefficients(type,frequency,q,gain,sampleRate);
        frequencies.forEach((f,i)=>{
          const actual=20*Math.log10(mags[i]);
          const graph=math.bandDbAtY(c,Math.sin(Math.PI*f/sampleRate)**2);
          const error=Math.abs(actual-graph);comparisons++;
          if(error>maxResponseError){maxResponseError=error;worstResponse={sampleRate,type,gain,frequency,q,at:f,actual,graph};}
        });
      }
    }
    const ceiling=10**(-1/20);
    const renders=[];
    for(const sampleRate of [44100,48000,96000]) for(const scenario of ['quiet','boost','impulses','stereo','mixed']) {
      const length=sampleRate;
      const delay=Math.ceil(sampleRate*.005);
      const context=new OfflineAudioContext(2,length+delay,sampleRate);
      const {buildChain,flatBands,setupOutputNodes,readOutputPeak}=new Function('ctx','chrome',engine+';audioContext=ctx;return {buildChain,flatBands,setupOutputNodes,readOutputPeak};')(context,{runtime:{getURL:name=>base+'/'+name}});
      await setupOutputNodes();
      let firstInput;
      for(let tab=0;tab<(scenario==='mixed'?3:1);tab++) {
        const buffer=context.createBuffer(2,length,sampleRate);
        for(let ch=0;ch<2;ch++) {
          const data=buffer.getChannelData(ch);
          for(let i=0;i<length;i++) {
            const sine=Math.sin(2*Math.PI*(1000+tab*319)*i/sampleRate);
            data[i]=scenario==='quiet'?.05*sine:scenario==='impulses'?(i%997===0?1000:0):scenario==='stereo'?3*sine*(ch?-.5:1):sine;
          }
        }
        firstInput??=buffer.getChannelData(0).slice();
        const entry={};const bands=flatBands();
        if(scenario==='boost'){bands[5]={f:1000,g:30,q:.7071};}
        buildChain(entry,bands,scenario==='boost'?10:1);
        const source=context.createBufferSource();source.buffer=buffer;source.connect(entry.preGain);source.start();
      }
      const rendered=await context.startRendering();
      const left=rendered.getChannelData(0),right=rendered.getChannelData(1);
      let peak=0,quietError=0,stereoError=0;
      for(let i=0;i<left.length;i++){
        peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
        if(scenario==='quiet')quietError=Math.max(quietError,Math.abs(left[i]-(firstInput[i-delay]??0)));
        if(scenario==='stereo')stereoError=Math.max(stereoError,Math.abs(right[i]+left[i]*.5));
      }
      const meterPeak=readOutputPeak();
      renders.push({sampleRate,scenario,peak,quietError,stereoError,meterPeak});
    }
    return {comparisons,maxResponseError,worstResponse,ceiling,renders,master6dB:math.dbToMasterGain(6),masterStored2:math.masterGainToDb(2)};
  },{audio,engine,base});
  console.log(JSON.stringify(result,null,2));
  assert.ok(result.maxResponseError<0.02,`Graph differs from native Web Audio by ${result.maxResponseError} dB`);
  assert.ok(Math.abs(result.master6dB-10**(6/20))<1e-12);
  for(const render of result.renders){
    assert.ok(Number.isFinite(render.peak)&&render.peak<=result.ceiling,`${render.scenario} exceeds sample ceiling`);
    assert.ok(render.quietError<1e-6,'Quiet signal changed beyond its declared delay');
    assert.ok(render.stereoError<1e-6,'Stereo relationship changed');
    assert.ok(render.meterPeak<=result.ceiling,'Output meter observes a signal before limiting');
    if(render.scenario==='stereo')assert.ok(render.meterPeak>.8,'Stereo meter downmixes and under-reports output');
  }
  console.log('Native Web Audio checks passed.');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
