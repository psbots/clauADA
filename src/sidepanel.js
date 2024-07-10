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

// Add this function to check if the typing indicator is visible
function isTypingIndicatorVisible() {
    return !typingIndicator.classList.contains('hidden');
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function addMessage(message, isUser = false) {
    const messageElement = document.createElement('div');
    messageElement.className = `p-4 ${isUser ? 'bg-blue-100 text-right' : 'bg-gray-100'} rounded-lg mb-2`;
    
    if (!isUser && message.includes('<python>') && message.includes('</python>')) {
        const parts = message.split(/<python>|<\/python>/);
        parts.forEach((part, index) => {
            if (index % 2 === 0) {
                // Regular text
                const textNode = document.createTextNode(part);
                messageElement.appendChild(textNode);
            } else {
                // Python code
                const codeElement = document.createElement('pre');
                codeElement.className = 'bg-gray-200 p-2 rounded';
                codeElement.textContent = part.trim();
                messageElement.appendChild(codeElement);

                const executeButton = document.createElement('button');
                executeButton.textContent = 'Execute';
                executeButton.className = 'bg-blue-500 text-white px-2 py-1 rounded mt-2';
                executeButton.onclick = () => executePythonCode(part.trim());
                messageElement.appendChild(executeButton);
            }
        });
    } else {
        messageElement.textContent = message;
    }

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatHistory.push({ role: isUser ? 'user' : 'assistant', content: message });
    saveCurrentChat();
}

function executePythonCode(code) {
    const outputElement = document.getElementById('code-output');
    const outputContent = document.getElementById('output-content');
    outputElement.classList.remove('hidden');
    outputContent.textContent = 'Executing...';

    // Create a new PyScript runtime
    // const pyodide = new loadPyodide();
    // pyodide.then(() => {
    //     try {
    //         const output = pyodide.runPython(code);
    //         outputContent.textContent = output;
    //     } catch (error) {
    //         outputContent.textContent = `Error: ${error.message}`;
    //     }
    // });
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
    
    if (settings.apiType === 'anthropic') {
        const response = await sendToAnthropic(message, settings.anthropicApiKey);
        addMessage(response);
    } else if (settings.apiType === 'aws-bedrock') {
        await sendToAWSBedrock(message, settings.awsAccessKeyId, settings.awsSecretAccessKey);
    } else {
        throw new Error('Invalid API type');
    }
}

async function sendToAnthropic(message, apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
        },
        body: JSON.stringify({
            model: 'claude-2',
            messages: chatHistory,
        }),
    });

    if (!response.ok) {
        throw new Error('Anthropic API request failed');
    }

    const data = await response.json();
    return data.content[0].text;
}

async function sendToAWSBedrock(message, accessKeyId, secretAccessKey) {
    const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require("@aws-sdk/client-bedrock-runtime");

    const client = new BedrockRuntimeClient({
        region: "us-east-1", // Replace with your preferred region
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
        },
    });
    console.log(chatHistory)
    const params = {
        modelId: "anthropic.claude-3-haiku-20240307-v1:0", // Use the appropriate model ID
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            system: "You are a special broswer based Data Analysis assistant that helps the user with their query. Write any code required in Python only, especially the PyScript version since the code will be executed in the browser. Matplotlib, numpy and pandas libraries are installed already. For displaying matplotlib plots, just add the name of the object for example plt at the end.  Write the python code between <python> and </python> blocks",
            messages:chatHistory,
            temperature: 0.7,
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

        // Create a new message element for the full response
        const messageElement = document.createElement('div');
        messageElement.className = 'p-4 bg-gray-100 rounded-lg mb-2';
        chatMessages.appendChild(messageElement);

        // Process the full response to ensure all code blocks are properly formatted
        const processedResponse = processCodeBlocks(fullResponse, messageElement);

        // Add the assistant's processed response to chatHistory
        chatHistory.push({ role: 'assistant', content: processedResponse });
        saveCurrentChat(); // Save the chat after the streaming response is complete

        // Scroll to the bottom of the chat
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return processedResponse;
    } catch (error) {
        console.error('Error calling AWS Bedrock:', error);
        throw new Error('AWS Bedrock API request failed');
    }
}

function processCodeBlocks(response, messageElement) {
    const codeBlockRegex = /<python>([\s\S]*?)<\/python>/g;
    let match;
    let lastIndex = 0;
    let processedResponse = '';

    while ((match = codeBlockRegex.exec(response)) !== null) {
        // Add text before the code block
        const textBefore = response.slice(lastIndex, match.index);
        processedResponse += textBefore;
        if (textBefore.trim()) {
            const textElement = document.createElement('div');
            textElement.className = 'mb-2';
            textElement.textContent = textBefore.trim();
            messageElement.appendChild(textElement);
        }

        // Process the code block
        const codeContent = match[1].trim();
        processedResponse += `<python>${codeContent}</python>`;

        const codeContainer = document.createElement('div');
        codeContainer.className = 'mb-4';
        codeContainer.id = 'py-repl-parent'

        const codeElement = document.createElement('py-repl');
        // codeElement.className = 'bg-gray-200 p-2 rounded';
        codeElement.className = 'mb-4';
        codeElement.textContent = codeContent;
        codeContainer.appendChild(codeElement);

        const pyterminalContainer = document.createElement('div');
        pyterminalContainer.className = 'mb-4';
        pyterminalContainer.id = "py-terminal-parent"

        const pyterminalElement = document.createElement('py-terminal')
        pyterminalElement.id = "py-terminal"
        pyterminalContainer.appendChild(pyterminalElement);

        // const executeButton = document.createElement('button');
        // executeButton.textContent = 'Execute';
        // executeButton.className = 'bg-blue-500 text-white px-2 py-1 rounded mt-2';
        // executeButton.onclick = () => executePythonCode(codeContent);
        // codeContainer.appendChild(executeButton);

        messageElement.appendChild(codeContainer);
        messageElement.appendChild(pyterminalContainer);

        lastIndex = codeBlockRegex.lastIndex;
    }

    // Add any remaining text after the last code block
    const textAfter = response.slice(lastIndex);
    if (textAfter.trim()) {
        processedResponse += textAfter;
        const textElement = document.createElement('div');
        textElement.textContent = textAfter.trim();
        messageElement.appendChild(textElement);
    }

    return processedResponse;
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
        
        // Re-render messages
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
