// Common constants
export const SYSTEM_PROMPT = "You are a special browser-based Data Analysis assistant that helps the user with their query. Write any code required in Python only, especially the PyScript version since the code will be executed in the browser. Matplotlib, numpy and pandas libraries are installed already. For displaying matplotlib plots, just add the name of the object for example plt at the end. Write the python code between <python> and </python> blocks";

// Common functions
export function processCodeBlocks(response, messageElement) {
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
        codeElement.className = 'mb-4';
        codeElement.textContent = codeContent;
        codeContainer.appendChild(codeElement);

        const pyterminalContainer = document.createElement('div');
        pyterminalContainer.className = 'mb-4';
        pyterminalContainer.id = "py-terminal-parent"

        const pyterminalElement = document.createElement('py-terminal')
        pyterminalElement.id = "py-terminal"
        pyterminalContainer.appendChild(pyterminalElement);

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

export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
