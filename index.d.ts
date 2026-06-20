import * as Ollama from 'ollama';

import { Ollama, ChatResponse, GenerateResponse, Message, ToolCall } from 'ollama';

export declare type ToolCallback = (call: ToolCall) => string | Promise<string>;

export declare interface GenerateRequest extends Ollama.GenerateRequest {
    stream?: true;
    /** Abort timeout in milliseconds */
    timeout?: number;
}

export declare interface GenerateResponse extends Ollama.GenerateResponse {
    response: string;
    thinking?: string;
    chunk?: MessageChunk;
}

export declare interface ChatRequest extends Ollama.ChatRequest {
    stream?: true;
    /** Abort timeout in milliseconds */
    timeout?: number;
}

export declare interface ChatResponse extends Ollama.ChatResponse {
    /**
     * Additional messages related to this response. 
     * If a Message is created due to a ChatStreamCallback, it will also be included here.
     */
    messages?: Message[];
}

export declare interface Message extends Ollama.Message {
    /** Only present when accessed inside of ChatStreamCallback */
    chunk?: MessageChunk;
}

export declare interface Tool extends Ollama.Tool {
    function: {
        name: string;
        description?: string;
        parameters?: any;
        /** The literal function that should run due to a ToolCall from the model. */
        callback?: ToolCallback;
    };
}

export declare interface MessageChunk {
    /** The part of the content generated in this chunk (`chat`) */
    content?: string;
    /** The part of the response generated in this chunk (`generate`) */
    response?: string;
    /** The part of the thinking generated in this chunk (`chat` & `generate`) */
    thinking?: string;
    /** The tool_calls in this chunk (`chat`) */
    tool_calls?: ToolCall[];
}

/**
 * Return an array of messages to cause a recursive chat generation.
 */
export declare type ChatStreamCallback = (response: ChatResponse) => Message[] | null | Promise<Message[] | null>;
export declare type GenerateStreamCallback = (response: GenerateResponse) => void | Promise<void>;

export declare interface OllamaChatRequest extends Ollama.ChatRequest {
    /** Abort timeout in milliseconds */
    timeout?: number;
}

export declare interface OllamaGenerateRequest extends Ollama.GenerateRequest {
    /** Abort timeout in milliseconds */
    timeout?: number;
}

export declare class OllamaChat extends Ollama {
    /**
     * The saved history of the chat so far.
     * To add messages without causing generations, add to this array.
     * Touching this array during generations may result in undefined behavior.
     */
    history: Message[];
    
    chat(request: OllamaChatRequest, streamCallback?: ChatStreamCallback): Promise<ChatResponse>;
    generate(request: OllamaGenerateRequest, streamCallback?: GenerateStreamCallback): Promise<GenerateResponse>;
}

