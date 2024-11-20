import { Buffer } from 'buffer'

if (typeof window !== 'undefined') {
    window.global = window;
    window.Buffer = Buffer;
    window.process = {
        env: { NODE_DEBUG: undefined },
        version: '',
        nextTick: function (fn: Function) {
            setTimeout(fn, 0);
        }
    };
} 