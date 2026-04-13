const params = new URLSearchParams(window.location.search);

export const DEV_MODE =
    params.get('dev') === '1' ||
    window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
