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
     * @callback ChatStreamCallback
     * @param {import("ollama").ChatResponse} response
     * @returns {import("ollama").Message[] | null} Return an array of messages to cause a recursive chat generation.
     */
    /**
     * @callback GenerateStreamCallback
     * @param {import("ollama").GenerateResponse} response
     * @returns {void}
     */
    /**
     * @param {import("ollama").ChatRequest} request 
     * @param {ChatStreamCallback} streamCallback 
     * @returns {Promise<import("ollama").ChatResponse>}
     */
    async chat(request, streamCallback) {
        // NOTE: timeout is not in ollama's spec so updates may override this name
        // NOTE: __internal is used to pass timeoutId along tool generations
        const { messages, tools, timeout, ...properties } = request;
        const __internal = request.__internal || {};
        this.history.push(...(messages || []));

        // chat with history
        // NOTE: This returns an AbortableAsyncIterable<ChatResponse> in current `ollama`, so `response` is a controller and `await response` is a message chunk
        const response = await super.chat({
            messages: this.history,
            tools,
            ...properties,
            stream: true,
        });

        // handle timeout (ollama's AbortableAsyncIterable will cancel the request server-side upon .abort())
        // NOTE: response.abort() stops ollama early on the server-side, but it seems to acknowledge it as a 200 OK rather than the usual 499 "Client Closed Request"
        const timeoutId = __internal.timeoutId ? __internal.timeoutId : setTimeout(() => timeout ? response.abort() : null, timeout || 0);

        // response is AbortableAsyncIterable<ChatResponse>
        // return response with chunked message put together
        let inThinking = false;
        let messageContent = "";
        let messageThinking;

        // NOTE: for tools, either the tools will have callbacks or the streamCallback can handle them manually
        /** @type {import("ollama").ToolCall[] | null} */
        let messageToolCalls;
        let recursiveMessages;
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

            if (chunk.message.tool_calls) {
                messageToolCalls = chunk.message.tool_calls;
            }

            const stitchedResponse = {
                ...chunk,
                message: {
                    ...chunk.message,
                    content: messageContent,
                    thinking: messageThinking,
                    tool_calls: messageToolCalls,
                    // NOTE: chunk is not in ollama's spec so updates may override this name
                    chunk: {
                        content: chunk.message.content,
                        thinking: chunk.message.thinking,
                        tool_calls: chunk.message.tool_calls,
                    }
                },
                messages: __internal.messages
            };
            if (streamCallback) {
                try {
                    const newMessages = await streamCallback(stitchedResponse);
                    if (newMessages && Array.isArray(newMessages) && newMessages.length > 0) {
                        recursiveMessages = newMessages;
                    }
                } catch (err) {
                    clearTimeout(timeoutId);
                    response.abort();
                    throw err;
                }
            }

            // if we are done generating then stitchedResponse should contain everything
            if (chunk.done) {
                this.history.push(stitchedResponse.message);

                // handle recursiveness (directly caused by streamCallback)
                if (recursiveMessages) {
                    this.history.push(...recursiveMessages);
                }
                // handle recursiveness (caused by tool.function.callback functions)
                const toolsUsed = [];
                if (messageToolCalls) {
                    for (const call of messageToolCalls) {
                        // execute the appropriate tool
                        const usedTool = tools.find(tool => tool.function.name === call.function.name);
                        if (!usedTool || !usedTool.function.callback) continue; // Assume this tool was handled by streamCallback

                        // add the tool result to the messages
                        let toolResult = "";
                        try {
                            toolResult = await usedTool.function.callback(call);
                        } catch (err) {
                            console.warn(usedTool.function.name, err);
                            toolResult = `${err}`;
                        }

                        // push to chat history and state the tool was used
                        const toolMessage = {
                            role: 'tool',
                            tool_name: call.function.name,
                            content: toolResult
                        };
                        toolsUsed.push(toolMessage);
                        this.history.push(toolMessage);
                    }
                }
                // see if either recursive reasons have occurred
                if (recursiveMessages || toolsUsed.length > 0) {
                    // recursively run .chat with our internal state
                    return await this.chat({
                        messages: [],
                        tools,
                        ...properties,

                        // NOTE: private state
                        __internal: {
                            timeoutId: timeoutId,
                            messages: [
                                // NOTE: In order, we get the last messages, the AI message, streamCallback messages, and tool callbacks
                                ...(__internal.messages ? __internal.messages : []),
                                stitchedResponse.message,
                                ...(recursiveMessages ? recursiveMessages : []),
                                ...toolsUsed
                            ],
                        }
                    }, streamCallback);
                }

                // NOTE: we are on the final response OR there were no recursive calls in the first place
                clearTimeout(timeoutId);
                return stitchedResponse;
            }
        }
    }

    /**
     * @param {import("ollama").GenerateRequest} request 
     * @param {GenerateStreamCallback} streamCallback 
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
