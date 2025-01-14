import { Buffer } from 'buffer'

if (typeof window !== 'undefined') {
    window.global = window;
    window.Buffer = Buffer;
    window.process = {
        env: {
            NODE_DEBUG: undefined,
            NODE_ENV: import.meta.env.MODE
        },
        version: '',
        nextTick: function (fn: Function) {
            setTimeout(fn, 0);
        }
    };
} 