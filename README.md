# Notice
This is heavily work-in-progress. Do not use for your own projects right now. I am in the process of refining the module for casual use.

# ollama-chatting
Wrapper around [`ollama`](https://www.npmjs.com/package/ollama) to make chat history and timeouts built-in.

Originally implemented OpenAI's API thanks to [the work done by others](#originally-built-upon). Due to the recent addition of tools and other complicated features implemented in the Ollama REST API, I have decided to make this a wrapper around their library instead.

## Modifications
- Chat history is baked into the `chat` method
- Streaming is handled through callbacks (internally, streaming is enforced; simply await the method with no callback to utilize it as if streaming were disabled)
    - This is for simplicity (especially when dealing with the library having to handle chat history automatically)
    - When streaming callbacks return a truthy value, it is assumed to be an Ollama `Message` and will be added to chat history.
        - This is to simplify tool calling.
        - The `chat` method will be called again with the tool result, and the .
- Request timeouts are built into `generate` and `chat` via `request.timeout` (milliseconds)
- Tools can define their callbacks directly at definition
    - Define `callback` within a tool  

## Originally built upon
ollama-chatting was made using a lot of existing work.
Thanks to:
- 14-3dgar and LOLEMO (credited by PenguinAI) for TurboGPT: https://github.com/14-3dgar/turboGPT
- Anonymous-cat1 for temporarily fixing TurboGPT at some point: https://github.com/Anonymous-cat1/WorkingTurboGPT
- PenguinGPT and PenguinAI by Ruby Team, MubiLop, and others for PenguinAI: https://github.com/PenguinAI-Ext

ollama-chatting is now a wrapper around [`ollama`](https://www.npmjs.com/package/ollama).

## License

[MIT](https://choosealicense.com/licenses/mit/)
