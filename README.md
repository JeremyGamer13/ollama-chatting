# ollama-chatting
Wrapper around [`ollama`](https://www.npmjs.com/package/ollama) to make chat history and timeouts built-in.

Originally implemented OpenAI's API thanks to [the work done by others](#originally-built-upon). Due to the recent addition of tools and other complicated features implemented in the Ollama REST API, I have decided to make this a wrapper around their library instead.

## Modifications
- Chat history is baked into the `chat` method (accessible via `OllamaChat.history`)
- Request timeouts are built into `generate` and `chat` via `request.timeout` (milliseconds)
    - Request timeouts are enforced as a single timer across all recursive requests (seen in the `chat` method)
- Streaming is handled through callbacks (internally, streaming is enforced; simply await the method with no callback to utilize it as if streaming were disabled)
    - This is for simplicity (especially when dealing with the library having to handle chat history automatically)
    - When streaming callbacks return a truthy value, it is assumed to be an array of Ollama `Message`s and will be added to `OllamaChat.history`.
        - This is to simplify tool calling on tools that do not have a direct `callback`.
        - The `chat` method will be called again with the new `OllamaChat.history` and the final result of `chat` will be the last message generated.
            - To access intermediate messages, get them from `ChatResponse.messages`
- Tools can define their callbacks directly at definition
    - Define `callback` within a `Tool` to have `OllamaChat` automatically handle the tool callback.
    - Errors within a tool callback will be given back to the AI model and warned. Catch them within the callback to prevent this behavior.
    - `chat` will automatically re-run the request with the tool result added to the `OllamaChat.history`.
        - To access intermediate messages, get them from `ChatResponse.messages`

## Example
### Basic Streaming
```js
const Ollama = require("ollama-chatting");
const OllamaChat = new Ollama({ host: "http://localhost:11434" });
// OllamaChat.chat() returns a Promise<ChatResponse>
const response = await OllamaChat.chat({
    model: 'gemma4:e4b',
    think: true,
    messages: [{
        role: "user",
        content: "Can you write a long introduction of yourself?"
    }],
}, (chunk) => {
    // chunk.message.content & chunk.message.thinking contain stitched together versions of all the chunks so far.
    // to access this specific chunk's generation, we use chunk.message.chunk
    if (chunk.message.chunk.thinking) process.stdout.write(chunk.message.chunk.thinking);
    if (chunk.message.chunk.content) process.stdout.write(chunk.message.chunk.content);
});
// response is returned after all chunks are finished
console.log(response);
```
### Tools
```js
const Ollama = require("ollama-chatting");
const OllamaChat = new Ollama({ host: "http://localhost:11434" });

const tools = [
    {
        type: 'function',
        function: {
            name: 'get_temperature',
            description: 'Get the current temperature for a city in degrees Fahrenheit',
            parameters: {
                type: 'object',
                required: ['city'],
                properties: {
                    city: { type: 'string', description: 'The name of the city' },
                },
            },
            callback: async (call) => {
                // This callback can be asynchronous, it just needs to return a string at the end.
                return `54°F ${call.function.arguments.city}`;
            },
        },
    },
];

const response = await OllamaChat.chat({
    model: 'gemma4:e4b',
    think: true,
    tools,
    messages: [{
        role: "user",
        content: "Please get the current temperature in Austin, Texas."
    }],
}, (chunk) => {
    if (chunk.message.chunk.thinking) process.stdout.write(chunk.message.chunk.thinking);
    if (chunk.message.chunk.content) process.stdout.write(chunk.message.chunk.content);
});
// This response will only return the last message in the chain of messages.
// To obtain all previous messages, get response.messages
console.log(response);
```
### Tools (through ChatStreamCallback)
```js
const Ollama = require("ollama-chatting");
const OllamaChat = new Ollama({ host: "http://localhost:11434" });

// Regular array of ollama compliant tools
const tools = [
    {
        type: 'function',
        function: {
            name: 'get_temperature',
            description: 'Get the current temperature for a city in degrees Fahrenheit',
            parameters: {
                type: 'object',
                required: ['city'],
                properties: {
                    city: { type: 'string', description: 'The name of the city' },
                },
            },
        },
    },
];

const response = await OllamaChat.chat({
    model: 'gemma4:e4b',
    think: true,
    tools,
    messages: [{
        role: "user",
        content: "Please get the current temperature in Austin, Texas."
    }],
}, async (chunk) => {
    if (chunk.message.chunk.thinking) process.stdout.write(chunk.message.chunk.thinking);
    if (chunk.message.chunk.content) process.stdout.write(chunk.message.chunk.content);
    
    // Remember that chunk.message contains the stitched together information from all previous chunks.
    // Check that this chunk is the final chunk, and get the stitched tool_calls to run.
    if (chunk.done && chunk.message.tool_calls) {
        // To make a tool response, we need to return Message[] in the ChatStreamCallback.
        const newMessages = [];
        for (const call of chunk.message.tool_calls) {
            switch (call.function.name) {
                case "get_temperature":
                    newMessages.push({
                        role: "tool",
                        tool_name: "get_temperature",
                        content: `54°F ${call.function.arguments.city}`,
                    });
                    break;
            }
        }
        return newMessages;
    }
});
// This response will only return the last message in the chain of messages.
// To obtain all previous messages, get response.messages
console.log(response);
```

## Typings
### Introduced
```js
/**
 * @callback ChatStreamCallback
 * @param {Ollama.ChatResponse} response
 * @returns {Ollama.Message[] | null} Return an array of messages to cause a recursive chat generation.
 */
/**
 * @callback GenerateStreamCallback
 * @param {Ollama.GenerateResponse} response
 * @returns {void}
 */
```
```js
/**
 * The saved history of the chat so far.
 * To add messages without causing generations, add to this array.
 * Touching this array during generations may result in undefined behavior.
 * @type {Array<Ollama.Message>}
 */
OllamaChat.history = [];
```
```ts
type ToolCallback = (call: Ollama.ToolCall) => string | Promise<string>;

interface MessageChunk {
    /** The part of the content generated in this chunk (`chat`) */
    content?: string;
    /** The part of the response generated in this chunk (`generate`) */
    response: string;
    /** The part of the thinking generated in this chunk (`chat` & `generate`) */
    thinking?: string;
    /** The tool_calls in this chunk (`chat`) */
    tool_calls?: ToolCall[];
}
```

### Modified (Ollama)
```ts
interface GenerateRequest {
    // all existing props...
    stream?: true;
    /** Abort timeout in milliseconds */
    timeout?: number;
}
interface GenerateResponse {
    // all existing props...
    /** The response generated so far (all chunks stitched together) */
    response: string;
    /** The thinking generated so far (all chunks stitched together) */
    thinking?: string;
    /** The current response chunk to process */
    chunk?: MessageChunk;
}

interface ChatRequest {
    // all existing props...
    stream?: true;
    /** Abort timeout in milliseconds */
    timeout?: number;
}
interface ChatResponse {
    // all existing props...
    /** Additional messages related to this response. These are likely assistant messages calling tools or tool messages. If a `Message` is created due to a `ChatStreamCallback`, it will also be included here. The `ChatResponse.message` is not included in this array for serialization purposes. */
    messages?: Message[];
}
interface Message {
    // all existing props...
    /** The current message chunk to process (only expect this to be present when accessed inside of `ChatStreamCallback`) */
    chunk?: MessageChunk;
}

interface Tool {
    // all existing props...
    function: {
        // all existing props...
        /** The literal function that should run due to a `ToolCall` from the model. */
        callback?: ToolCallback;
    };
}
```

## Originally built upon
ollama-chatting was made using a lot of existing work.
Thanks to:
- 14-3dgar and LOLEMO (credited by PenguinAI) for TurboGPT: https://github.com/14-3dgar/turboGPT
- Anonymous-cat1 for temporarily fixing TurboGPT at some point: https://github.com/Anonymous-cat1/WorkingTurboGPT
- PenguinGPT and PenguinAI by Ruby Team, MubiLop, and others for PenguinAI: https://github.com/PenguinAI-Ext

ollama-chatting is now a wrapper around [`ollama`](https://www.npmjs.com/package/ollama).

## License

[MIT](https://choosealicense.com/licenses/mit/)
