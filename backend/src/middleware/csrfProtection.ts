import csrf from 'csurf';

export const csrfProtection = csrf({
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}); 