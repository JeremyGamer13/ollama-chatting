/**
 * specify `timeout` in options as milliseconds
 * @param {string|URL|globalThis.Request} url 
 * @param {RequestInit} options 
 * @returns {Promise<Response>}
 */
const fetchWithTimeout = async (url, options = {}) => {
    // you specify timeout in options
    const { timeout = 0 } = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);

    return response;
};

module.exports = fetchWithTimeout;