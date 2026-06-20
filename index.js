/*!
ollama-chatting was made using a lot of existing work.
Thanks to:
- 14-3dgar and LOLEMO (credited by PenguinAI) for TurboGPT: https://github.com/14-3dgar/turboGPT
- Anonymous-cat1 for temporarily fixing TurboGPT at some point: https://github.com/Anonymous-cat1/WorkingTurboGPT
- PenguinGPT and PenguinAI by Ruby Team, MubiLop, and others for PenguinAI: https://github.com/PenguinAI-Ext

ollama-chatting is now a wrapper around [`ollama`](https://www.npmjs.com/package/ollama).
*/
/** */
const { Ollama } = require("ollama");
class OllamaChat extends Ollama {
    /**
     * @param {import("ollama").Config} config 
     */
    constructor(config) {
        super(config);
        /**
         * The saved history of the chat so far.
         * To add messages without causing generations, add to this array.
         * Touching this array during generations may result in undefined behavior.
         * @type {Array<import("ollama").Message>}
         */
        this.history = [];
    }

    /**
     * @param {import("ollama").ChatRequest} request 
     * @param {(import("ollama").ChatResponse) => (void)} streamCallback 
     * @returns {Promise<import("ollama").ChatResponse>}
     */
    async chat(request, streamCallback) {
        // NOTE: timeout is not in ollama's spec so updates may override this name
        const { messages, timeout, ...properties } = request;
        this.history.push(...messages);

        // chat with history
        const response = await super.chat({
            messages: this.history,
            ...properties,
            stream: true,
        });

        // handle timeout (ollama's AbortableAsyncIterable will cancel the request server-side upon .abort())
        const timeoutId = setTimeout(() => timeout ? response.abort() : null, timeout || 0);

        // response is AbortableAsyncIterable<ChatResponse>
        // return response with chunked message put together
        let inThinking = false
        let messageContent = "";
        let messageThinking;
        for await (const chunk of response) {
            if (chunk.message.thinking && !inThinking) {
                inThinking = true;
            }

            if (chunk.message.thinking) {
                if (!messageThinking) {
                    messageThinking = "";
                }
                messageThinking += chunk.message.thinking;
            } else if (chunk.message.content) {
                if (inThinking) {
                    inThinking = false;
                }
                messageContent += chunk.message.content;
            }

            const stitchedResponse = {
                ...chunk,
                message: {
                    ...chunk.message,
                    content: messageContent,
                    thinking: messageThinking,
                    // NOTE: chunk is not in ollama's spec so updates may override this name
                    chunk: {
                        content: chunk.message.content,
                        thinking: chunk.message.thinking,
                    }
                }
            };
            if (streamCallback) {
                try {
                    await streamCallback(stitchedResponse);
                } catch (err) {
                    clearTimeout(timeoutId);
                    response.abort();
                    throw err;
                }
            }

            // if we are done generating then stitchedResponse should contain everything
            if (chunk.done) {
                clearTimeout(timeoutId);
                this.history.push(stitchedResponse.message);
                return stitchedResponse;
            }
        }
    }

    /**
     * @param {import("ollama").GenerateRequest} request 
     * @param {(import("ollama").GenerateResponse) => (void)} streamCallback 
     * @returns {Promise<import("ollama").GenerateResponse>}
     */
    async generate(request, streamCallback) {
        const { timeout, ...properties } = request;
        const response = await super.generate({
            ...properties,
            stream: true,
        });

        // handle timeout (ollama's AbortableAsyncIterable will cancel the request server-side upon .abort())
        const timeoutId = setTimeout(() => timeout ? response.abort() : null, timeout || 0);

        // response is AbortableAsyncIterable<GenerateResponse>
        // return response with chunked message put together
        let inThinking = false
        let messageResponse = "";
        let messageThinking;
        for await (const chunk of response) {
            if (chunk.thinking && !inThinking) {
                inThinking = true;
            }

            if (chunk.thinking) {
                if (!messageThinking) {
                    messageThinking = "";
                }
                messageThinking += chunk.thinking;
            } else if (chunk.response) {
                if (inThinking) {
                    inThinking = false;
                }
                messageResponse += chunk.response;
            }

            const stitchedResponse = {
                ...chunk,
                response: messageResponse,
                thinking: messageThinking,
                // NOTE: this is not in ollama's message structure so updates may override this name
                chunk: {
                    response: chunk.response,
                    thinking: chunk.thinking,
                }
            };
            if (streamCallback) {
                try {
                    await streamCallback(stitchedResponse);
                } catch (err) {
                    clearTimeout(timeoutId);
                    response.abort();
                    throw err;
                }
            }

            // if we are done generating then stitchedResponse should contain everything
            if (chunk.done) {
                clearTimeout(timeoutId);
                return stitchedResponse;
            }
        }
    }
}

module.exports = OllamaChat;
