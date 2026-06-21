import type { Ollama as OllamaBase } from 'ollama';
import type * as ollama from 'ollama';

declare class OllamaChat extends (OllamaBase as new () => Omit<OllamaBase, 'chat' | 'generate'>) {
    /**
     * The saved history of the chat so far.
     * To add messages without causing generations, add to this array.
     * Touching this array during generations may result in undefined behavior.
     */
    history: OllamaChat.Message[];

    chat(request: OllamaChat.ChatRequest, streamCallback?: OllamaChat.ChatStreamCallback): Promise<OllamaChat.ChatResponse>;
    generate(request: OllamaChat.GenerateRequest, streamCallback?: OllamaChat.GenerateStreamCallback): Promise<OllamaChat.GenerateResponse>;
}

declare namespace OllamaChat {
    export type ToolCallback = (call: ollama.ToolCall) => string | Promise<string>;

    export interface MessageChunk {
        /** The part of the content generated in this chunk (`chat`) */
        content?: string;
        /** The part of the response generated in this chunk (`generate`) */
        response?: string;
        /** The part of the thinking generated in this chunk (`chat` & `generate`) */
        thinking?: string;
        /** The tool_calls in this chunk (`chat`) */
        tool_calls?: ollama.ToolCall[];
    }

    export interface GenerateRequest extends ollama.GenerateRequest {
        stream?: true;
        /** Abort timeout in milliseconds */
        timeout?: number;
    }

    export interface GenerateResponse extends ollama.GenerateResponse {
        response: string;
        thinking?: string;
        chunk?: OllamaChat.MessageChunk;
    }

    export interface ChatRequest extends ollama.ChatRequest {
        stream?: true;
        /** Abort timeout in milliseconds */
        timeout?: number;
    }

    export interface Message extends ollama.Message {
        /** Only present when accessed inside of ChatStreamCallback */
        chunk?: OllamaChat.MessageChunk;
    }

    export interface ChatResponse extends ollama.ChatResponse {
        /**
         * Additional messages related to this response. 
         * If a Message is created due to a ChatStreamCallback, it will also be included here.
         */
        messages?: OllamaChat.Message[];
    }

    export interface Tool extends ollama.Tool {
        function: {
            name: string;
            description?: string;
            parameters?: any;
            /** The literal function that should run due to a ToolCall from the model. */
            callback?: OllamaChat.ToolCallback;
        };
    }

    /**
     * Return an array of messages to cause a recursive chat generation.
     */
    export type ChatStreamCallback = (response: OllamaChat.ChatResponse) => OllamaChat.Message[] | null | Promise<OllamaChat.Message[] | null>;
    export type GenerateStreamCallback = (response: OllamaChat.GenerateResponse) => void | Promise<void>;
}

export = OllamaChat;
