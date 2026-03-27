/*!

ollama-chatting was made using a lot of existing work.
Thanks to:
- 14-3dgar and LOLEMO (credited by PenguinAI) for TurboGPT: https://github.com/14-3dgar/turboGPT
- Anonymous-cat1 for temporarily fixing TurboGPT at some point: https://github.com/Anonymous-cat1/WorkingTurboGPT
- PenguinGPT and PenguinAI by Ruby Team, MubiLop, and others for PenguinAI: https://github.com/PenguinAI-Ext

This library is just a modification to work with ollama's API (locally ran AI) and add some more QOL to handle it properly.
Please note there may be some rough work done here since this was originally only made for personal projects.
I would highly recommend the standard ollama package for most work: https://www.npmjs.com/package/ollama

*/
const fetchWithTimeout = require("./fetch-timeout");

class OllamaClient {
    constructor() {
        // config
        // lightweight ollama model i have rn
        this.aiModel = 'gemma3:4b';
        /**
         * boolean for models except for GPT-OSS which requires string for osme reason
         * @type {boolean|"low"|"medium"|"high"}
         */
        this.aiThinking = false;
        this.timeout = 25 * 1000; // 25 seconds

        this._api_url = env.get("OLLAMA_URL");
        this._chatHistories = {};
    }

    get apiUrl() {
        return this._api_url;
    }
    set apiUrl(url) {
        const newApiUrl = url;
        // Update the api_url variable
        this._api_url = newApiUrl;
    }

    // management
    chatExists(chatID) {
        return chatID in this._chatHistories;
    }

    createChat(chatIDd) {
        const chatID = chatIDd;
        if (!(chatID in this._chatHistories)) {
            this._chatHistories[chatID] = [];
        } else {
            throw new Error("That chat already exists");
        }
    }
    resetChat(chatID) {
        if (chatID in this._chatHistories) {
            this._chatHistories[chatID] = [];
        }
    }
    removeChat(chatID) {
        if (chatID in this._chatHistories) {
            delete this._chatHistories[chatID];
        }
    }

    overwriteChat(chatID, chatHistory) {
        if (Array.isArray(chatHistory)) {
            this._chatHistories[chatID] = chatHistory;
        } else {
            throw new Error('Invalid chatHistory. Expected an array.');
        }
    }
    /**
     * @param {object} importedChats 
     * @param {"overwrite"|"merge"} merge 
     */
    importChats(importedChats, merge) {
        const mergeOption = merge.toLowerCase();
        if (typeof importedChats === 'object' && importedChats !== null) {
            if (mergeOption === 'overwrite') {
                this._chatHistories = importedChats;
            } else if (mergeOption === 'merge') {
                const importedChatIDs = Object.keys(importedChats);
                for (const chatID of importedChatIDs) {
                    this._chatHistories[chatID] = importedChats[chatID];
                }
            } else {
                throw new Error('Invalid merge option. Expected "overwrite" or "merge".');
            }
        } else {
            throw new Error('Invalid importedChats. Expected an object.');
        }
    }

    getChat(chatID) {
        if (this._chatHistories[chatID] !== undefined) {
            const chatHistory = this._chatHistories[chatID];
            return chatHistory;
        } else {
            throw new Error("Not a chat");
        }
    }
    getAllChats() {
        const allChats = {};
        const chatIDs = Object.keys(this._chatHistories);
        for (const chatID of chatIDs) {
            allChats[chatID] = this._chatHistories[chatID];
        }
        return allChats;
    }
    listChatIds() {
        const activeChats = Object.keys(this._chatHistories);
        return activeChats;
    }

    // chatting
    informChat(chatID, inform) {
        if (chatID in this._chatHistories) {
            this._chatHistories[chatID].push({ role: "system", content: inform });
        }
    }
    /**
     * @param {"user"|"assistant"|"system"} role 
     */
    informChatWithRole(chatID, role, inform) {
        if (chatID in this._chatHistories) {
            this._chatHistories[chatID].push({ role, content: inform });
        }
    }

    /**
     * @typedef {Object} AIResponse
     * @property {"assistant"} role
     * @property {string} content - always a string, regardless of schema being used or other settings
     * @property {string?} thinking 
     */

    /** @returns {Promise<AIResponse>} */
    chatWithMessages(messages, format) {
        return fetchWithTimeout(this._api_url, {
            method: 'POST',
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.aiModel,
                think: this.aiThinking,
                stream: false,
                messages,
                format
            })
        })
            .then(response => {
                if (!response.ok) {
                    response.text().then(console.log);
                    throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                if (format) console.log(data);

                let botResponse = data.message;
                if (data.choices && data.choices.length > 0) {
                    botResponse = data.choices[0].message;
                }
                if (!botResponse) {
                    throw new Error("Unexpected response from the API");
                }

                return botResponse;
            })
            .catch(error => {
                console.error("Error sending prompt to AI", this._api_url, error.message);

                // Handle different error scenarios with custom messages
                if (error.message === "Unexpected response from the API") {
                    throw new Error("Unexpected response from AI");
                } else if (error.message === "Network response was not ok: 429 Too Many Requests") {
                    throw new Error("Too many requests. Please try again later");
                } else {
                    throw new Error("An unexpected error occurred. Please try again later");
                }
            });
    }

    /**
     * Prompt
     * @param {string} prompt 
     * @param {Buffer} imageBuffer 
     * @returns {Promise<AIResponse>}
     */
    async singlePrompt(prompt, imageBuffer) {
        const messages = [{
            role: "user",
            content: prompt,
            images: !imageBuffer ? [] : [imageBuffer.toString("base64")],
        }];
        return this.chatWithMessages(messages);
    }
    /**
     * Prompt for a specific chatID
     * @param {string} chatID 
     * @param {string} prompt 
     * @param {Buffer} imageBuffer 
     * @returns {Promise<AIResponse>}
     */
    async chatPrompt(chatID, prompt, imageBuffer) {
        if (!(chatID in this._chatHistories)) {
            throw new Error("That chatbot does not exist");
        }

        const chatHistory = this._chatHistories[chatID] || [];
        chatHistory.push({
            role: "user",
            content: prompt,
            images: !imageBuffer ? [] : [imageBuffer.toString("base64")],
        });

        const botResponse = await this.chatWithMessages(chatHistory);
        chatHistory.push({ role: "assistant", ...botResponse });
        this._chatHistories[chatID] = chatHistory;
        return botResponse;
    }
    /**
     * Prompt structured
     * @returns {Promise<AIResponse>}
     */
    async singleStructuredPrompt(format, prompt, imageBuffer) {
        const messages = [{
            role: "user",
            content: prompt,
            images: !imageBuffer ? [] : [imageBuffer.toString("base64")],
        }];
        return this.chatWithMessages(messages, format);
    }
    /**
     * Prompt for a specific chatID
     * @param {string} chatID 
     * @param {string} prompt 
     * @param {Buffer} imageBuffer 
     * @returns {Promise<AIResponse>}
     */
    async chatStructuredPrompt(chatID, format, prompt, imageBuffer) {
        if (!(chatID in this._chatHistories)) {
            throw new Error("That chatbot does not exist");
        }

        const chatHistory = this._chatHistories[chatID] || [];
        chatHistory.push({
            role: "user",
            content: prompt,
            images: !imageBuffer ? [] : [imageBuffer.toString("base64")],
        });

        const botResponse = await this.chatWithMessages(chatHistory, format);
        chatHistory.push({ role: "assistant", ...botResponse });
        this._chatHistories[chatID] = chatHistory;
        return botResponse;
    }
}

module.exports = OllamaClient;