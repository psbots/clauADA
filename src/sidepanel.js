import { SYSTEM_PROMPT, processCodeBlocks, generateUniqueId } from './utils.js';

const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const newChatButton = document.getElementById('new-chat-button');
const savedChatsContainer = document.getElementById('saved-chats');
const typingIndicator = document.getElementById('typing-indicator');

let currentChatId = null;
let chatHistory = [];

function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

function isTypingIndicatorVisible() {
    return !typingIndicator.classList.contains('hidden');
}

function addMessage(message, isUser = false) {
    const messageElement = document.createElement('div');
    messageElement.className = `p-4 ${isUser ? 'bg-blue-100 text-right' : 'bg-gray-100'} rounded-lg mb-2`;
    
    if (!isUser) {
        processCodeBlocks(message, messageElement);
    } else {
        messageElement.textContent = message;
    }

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatHistory.push({ role: isUser ? 'user' : 'assistant', content: message });
    saveCurrentChat();
}

async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        addMessage(message, true);
        chatInput.value = '';
        
        // Show typing indicator
        showTypingIndicator();
        
        try {
            await sendMessageToAPI(message);
            hideTypingIndicator();
        } catch (error) {
            console.error('Error:', error);
            hideTypingIndicator();
            addMessage("An error occurred while processing your request. Please try again.");
        }
    }
}

async function sendMessageToAPI(message) {
    const settings = await chrome.storage.sync.get(['apiType', 'anthropicApiKey', 'awsAccessKeyId', 'awsSecretAccessKey']);
    
    let response;
    if (settings.apiType === 'anthropic') {
        response = await sendToAnthropic(message, settings.anthropicApiKey);
    } else if (settings.apiType === 'aws-bedrock') {
        response = await sendToAWSBedrock(message, settings.awsAccessKeyId, settings.awsSecretAccessKey);
    } else {
        throw new Error('Invalid API type');
    }

    addMessage(response);
    return response;
}

async function sendToAnthropic(message, apiKey) {
    const settings = await chrome.storage.sync.get(['anthropicModel']);
    const model = settings.anthropicModel || 'claude-2';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: model,
            messages: chatHistory,
            system: SYSTEM_PROMPT,
            max_tokens: 1024,
            temperature: 0.9,
            top_p: 0.95,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Anthropic API Error:', errorData);
        throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

async function sendToAWSBedrock(message, accessKeyId, secretAccessKey) {
    const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require("@aws-sdk/client-bedrock-runtime");

    const settings = await chrome.storage.sync.get(['awsModel']);
    const modelId = settings.awsModel || "anthropic.claude-3-haiku-20240307-v1:0";

    const client = new BedrockRuntimeClient({
        region: "us-east-1",
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
        },
    });

    const params = {
        modelId: modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: chatHistory,
            temperature: 0.9,
            top_p: 0.95,
        }),
    };

    try {
        const command = new InvokeModelWithResponseStreamCommand(params);
        const response = await client.send(command);
        
        let fullResponse = '';

        for await (const chunk of response.body) {
            const decoded = new TextDecoder().decode(chunk.chunk.bytes);
            const parsed = JSON.parse(decoded);
            if (parsed.type === 'content_block_delta') {
                const text = parsed.delta.text;
                fullResponse += text;
            }
        }

        return fullResponse;
    } catch (error) {
        console.error('Error calling AWS Bedrock:', error);
        throw new Error('AWS Bedrock API request failed');
    }
}

function saveCurrentChat() {
    if (!currentChatId) {
        currentChatId = generateUniqueId();
    }
    localStorage.setItem(`chat_${currentChatId}`, JSON.stringify(chatHistory));
    updateSavedChatsList();
}

function loadChat(chatId) {
    const savedChat = localStorage.getItem(`chat_${chatId}`);
    if (savedChat) {
        chatHistory = JSON.parse(savedChat);
        currentChatId = chatId;
        
        // Clear existing messages
        chatMessages.innerHTML = '';
        
        // Re-render messages without saving
        chatHistory.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `p-4 ${message.role === 'user' ? 'bg-blue-100 text-right' : 'bg-gray-100'} rounded-lg mb-2`;
            
            if (message.role === 'assistant') {
                processCodeBlocks(message.content, messageElement);
            } else {
                messageElement.textContent = message.content;
            }

            chatMessages.appendChild(messageElement);
        });
        
        // Scroll to the bottom of the chat
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function updateSavedChatsList() {
    savedChatsContainer.innerHTML = '';
    const chats = Object.keys(localStorage)
        .filter(key => key.startsWith('chat_'))
        .map(key => ({
            id: key.split('_')[1],
            timestamp: parseInt(key.split('_')[1].split('-')[0], 36)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

    chats.forEach(chat => {
        const chatContainer = document.createElement('div');
        chatContainer.className = 'flex justify-between items-center mb-2';

        const chatButton = document.createElement('button');
        chatButton.className = 'flex-grow text-left px-3 py-2 text-sm text-slate-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-900 dark:text-slate-400 dark:hover:text-slate-300';
        chatButton.textContent = `Chat ${chat.id.substr(0, 6)}...`;
        chatButton.addEventListener('click', () => loadChat(chat.id));

        const deleteButton = document.createElement('button');
        deleteButton.className = 'ml-2 px-2 py-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });

        chatContainer.appendChild(chatButton);
        chatContainer.appendChild(deleteButton);
        savedChatsContainer.appendChild(chatContainer);
    });
}

function deleteChat(chatId) {
    if (confirm('Are you sure you want to delete this chat?')) {
        localStorage.removeItem(`chat_${chatId}`);
        if (currentChatId === chatId) {
            startNewChat();
        }
        updateSavedChatsList();
    }
}

function startNewChat() {
    currentChatId = null;
    chatMessages.innerHTML = '';
    chatInput.value = '';
    chatHistory = [];
}

sendButton.addEventListener('click', handleSendMessage);
chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});
newChatButton.addEventListener('click', startNewChat);

// Initialize
updateSavedChatsList();
console.log('sidepanel.js loaded');
