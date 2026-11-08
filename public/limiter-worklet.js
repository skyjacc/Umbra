import { LookaheadLimiter } from './limiter-core.js';

class UmbraOutputLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.limiter = new LookaheadLimiter(sampleRate, 2);
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'reset') this.limiter = new LookaheadLimiter(sampleRate, 2);
    };
  }

  process(inputs, outputs) {
    this.limiter.process(inputs[0] ?? [], outputs[0]);
    return true;
  }
}

registerProcessor('umbra-output-limiter', UmbraOutputLimiter);
