let activeUserId = null;
let activeUserName = "";
let authMode = 'signin';
let speechRecognition = null;
let isListening = false;
let speechBaseText = '';
let finalSpeechTranscript = '';
let shouldIgnoreSpeechResults = false;
let speechErrorMessage = '';
let speechStatusTimer = null;

function getFirstName(name) {
    const nameParts = String(name || '').trim().split(/\s+/);
    return nameParts[0] || 'there';
}

function getSpeechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function setSpeechStatus(message, isError = false) {
    const status = document.getElementById('speechStatus');
    if (!status) return;

    if (speechStatusTimer) {
        window.clearTimeout(speechStatusTimer);
        speechStatusTimer = null;
    }

    status.textContent = message;
    status.classList.toggle('is-error', isError);

    // Keep the live listening state visible, but clear completed states after four seconds.
    if (message && !isListening) {
        const displayedMessage = message;
        speechStatusTimer = window.setTimeout(() => {
            if (!isListening && status.textContent === displayedMessage) {
                status.textContent = '';
                status.classList.toggle('is-error', false);
            }
            speechStatusTimer = null;
        }, 4000);
    }
}

function updateSpeechButton() {
    const button = document.getElementById('speechBtn');
    if (!button) return;

    button.classList.toggle('is-listening', isListening);
    button.setAttribute('aria-pressed', String(isListening));
    button.setAttribute('aria-label', isListening ? 'Stop voice input' : 'Start voice input');
    button.title = isListening ? 'Stop voice input' : 'Start voice input';
}

function initializeSpeechRecognition() {
    const button = document.getElementById('speechBtn');
    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!button || !SpeechRecognition) {
        if (button) {
            button.disabled = true;
            button.setAttribute('aria-label', 'Voice input is unavailable in this browser');
            button.title = 'Voice input requires a supported browser';
        }
        setSpeechStatus('Voice input is unavailable in this browser.', true);
        return;
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    speechRecognition.lang = navigator.language || 'en-US';

    speechRecognition.onstart = () => {
        isListening = true;
        shouldIgnoreSpeechResults = false;
        speechErrorMessage = '';
        updateSpeechButton();
        setSpeechStatus('Listening...');
    };

    speechRecognition.onresult = (event) => {
        if (shouldIgnoreSpeechResults) return;

        let interimTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const transcript = event.results[index][0].transcript;
            if (event.results[index].isFinal) {
                finalSpeechTranscript += `${transcript} `;
            } else {
                interimTranscript += transcript;
            }
        }

        const input = document.getElementById('userInput');
        input.value = [speechBaseText, finalSpeechTranscript, interimTranscript]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(' ');
        input.focus();
    };

    speechRecognition.onerror = (event) => {
        if (event.error === 'aborted') return;

        const errorMessages = {
            'not-allowed': 'Microphone permission was denied. Allow it in your browser and try again.',
            'service-not-allowed': 'Speech recognition is unavailable. Check your browser microphone settings.',
            'audio-capture': 'No microphone was found. Connect one and try again.',
            'network': 'Speech recognition could not reach the service. Check your connection.',
            'no-speech': 'I did not hear anything. Try speaking again.'
        };

        speechErrorMessage = errorMessages[event.error] || 'Voice input stopped unexpectedly. Please try again.';
        isListening = false;
        updateSpeechButton();
        setSpeechStatus(speechErrorMessage, true);
    };

    speechRecognition.onend = () => {
        isListening = false;
        updateSpeechButton();

        if (shouldIgnoreSpeechResults) {
            shouldIgnoreSpeechResults = false;
            setSpeechStatus('');
            return;
        }

        if (!speechErrorMessage) {
            const message = finalSpeechTranscript.trim()
                ? 'Voice input added to your message.'
                : 'Voice input stopped.';
            setSpeechStatus(message);
        }

        document.getElementById('userInput').focus();
    };
}

function stopSpeechRecognition(discardPendingResults = false) {
    if (!speechRecognition || !isListening) return;

    shouldIgnoreSpeechResults = discardPendingResults;
    isListening = false;
    updateSpeechButton();

    if (discardPendingResults) {
        speechRecognition.abort();
    } else {
        speechRecognition.stop();
    }
}

function toggleSpeechRecognition() {
    if (!speechRecognition) {
        initializeSpeechRecognition();
    }

    if (!speechRecognition) {
        setSpeechStatus('Voice input is unavailable in this browser.', true);
        return;
    }

    if (isListening) {
        setSpeechStatus('Finishing voice input...');
        stopSpeechRecognition();
        return;
    }

    const input = document.getElementById('userInput');
    speechBaseText = input.value.trim();
    finalSpeechTranscript = '';
    shouldIgnoreSpeechResults = false;
    speechErrorMessage = '';

    try {
        speechRecognition.start();
    } catch (error) {
        isListening = false;
        updateSpeechButton();
        setSpeechStatus('Voice input is still closing. Please try again in a moment.', true);
    }
}

function showMessage(msg, isError = true) {
    const errDiv = document.getElementById('authError');
    const succDiv = document.getElementById('authSuccess');
    if (isError) {
        errDiv.innerText = msg; errDiv.style.display = 'block'; succDiv.style.display = 'none';
    }
    else {
        succDiv.innerText = msg; succDiv.style.display = 'block'; errDiv.style.display = 'none';
    }
}

function hideMessages() {
    document.getElementById('authError').style.display = 'none';
    document.getElementById('authSuccess').style.display = 'none';
}

function toggleMode() {
    hideMessages();
    const title = document.getElementById('authTitle');
    const primaryBtn = document.getElementById('primaryAuthBtn');
    const secondaryBtn = document.getElementById('secondaryAuthBtn');
    const nameInput = document.getElementById('name');

    // Reset password visibility automatically
    const pwdInput = document.getElementById('password');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');
    pwdInput.type = 'password';
    eyeOpen.style.display = 'block';
    eyeClosed.style.display = 'none';

    if (authMode === 'signin') {
        authMode = 'signup';
        title.innerText = 'Sign Up';
        primaryBtn.innerText = 'Sign Up';
        primaryBtn.onclick = signUp;
        secondaryBtn.innerText = 'Back to Sign In';
        nameInput.style.display = 'block'; // Show name field
    } else {
        authMode = 'signin';
        title.innerText = 'Sign In';
        primaryBtn.innerText = 'Sign In';
        primaryBtn.onclick = signIn;
        secondaryBtn.innerText = 'Create an Account';
        nameInput.style.display = 'none'; // Hide name field
    }
}

function togglePassword() {
    const pwdInput = document.getElementById('password');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');

    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
    } else {
        pwdInput.type = 'password';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
    }
}

async function signUp() {
    hideMessages();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
        
    if (!name) return showMessage("Please enter your name.");
    else if (!email) return showMessage("Please enter your email address.");
    else if (!password) return showMessage("Please enter your password.");

    const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    
    if (data.error) {
        showMessage(data.error);
    }
    else {
        alert("Account created! You can now sign in.");
        toggleMode();
    }
}

async function signIn() {
    hideMessages();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
        
    if (!email && !password) return showMessage("Please enter your email address and password.");
    else if (!email) return showMessage("Please enter your email address.");
    else if (!password) return showMessage("Please enter your password.");

    const res = await fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    
    if (data.error) {
        showMessage(data.error);
    }
    else {
        activeUserId = data.user_id;
        activeUserName = data.name;
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('chatScreen').style.display = 'flex';
        document.getElementById('headerUserName').innerText = data.name;
        
        document.getElementById('name').value = '';
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        
        loadUserHistory();
    }
}

function deleteAccount() {
    // Show the model and clear out any old text
    document.getElementById('deleteModel').style.display = 'flex';
    document.getElementById('deletePassword').value = '';
    clearDeletePasswordError();
}

function closeDeleteModel() {
    // Hide the model
    document.getElementById('deleteModel').style.display = 'none';
    clearDeletePasswordError();
}

function closeModalOnBackdrop(event) {
    if (event.target !== event.currentTarget) return;

    const modalId = event.currentTarget.id;
    if (modalId === 'deleteModel') {
        closeDeleteModel();
    } else if (modalId === 'clearChatModal') {
        closeClearChatModal();
    } else if (modalId === 'signOutModal') {
        closeSignOutModal();
    }
}

function showDeletePasswordError(message, isInvalidPassword = false) {
    const passwordInput = document.getElementById('deletePassword');
    const errorMessage = document.getElementById('deletePasswordError');

    errorMessage.textContent = message;
    errorMessage.classList.toggle('is-invalid', isInvalidPassword);
    passwordInput.classList.toggle('is-invalid', isInvalidPassword);
}

function clearDeletePasswordError() {
    const passwordInput = document.getElementById('deletePassword');
    const errorMessage = document.getElementById('deletePasswordError');

    errorMessage.textContent = '';
    errorMessage.classList.remove('is-invalid');
    passwordInput.classList.remove('is-invalid');
}

async function confirmDeleteAccount() {
    const password = document.getElementById('deletePassword').value.trim();
    
    if (!password) {
        showDeletePasswordError('Please enter your password to confirm.');
        return;
    }

    try {
        // Send both the user ID and the password to the backend
        const res = await fetch('/api/delete_account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: activeUserId,
                password: password
            })
        });
            
        const data = await res.json();
        
        if (data.status === 'deleted') {
            alert("Your account has been successfully deleted.");
            closeDeleteModel();
            performSignOut(); // Safely reset the UI to the sign-in screen
        } else {
            const backendMessage = data.error || 'Failed to delete account.';
            const isIncorrectPassword = res.status === 401 || backendMessage.toLowerCase() === 'incorrect password!';
            const message = isIncorrectPassword ? 'Incorrect password!' : backendMessage;
            showDeletePasswordError(message, isIncorrectPassword);
        }
    }
    catch (err) {
        showDeletePasswordError('Failed to connect to server. Please try again.');
        console.error(err);
    }
}

function signOut() {
    document.getElementById('signOutModal').style.display = 'flex';
}

function closeSignOutModal() {
    document.getElementById('signOutModal').style.display = 'none';
}

function confirmSignOut() {
    closeSignOutModal();
    performSignOut();
}

function replayWelcomeAnimation() {
    const welcomeTitle = document.querySelector('.welcome-title');
    if (!welcomeTitle) return;

    // Reset the completed keyframe animation before showing the auth screen again.
    welcomeTitle.classList.remove('is-writing');
    void welcomeTitle.offsetWidth;
    welcomeTitle.classList.add('is-writing');
}

function performSignOut() {
    stopSpeechRecognition(true);

    // 2. Clear the active session
    activeUserId = null;
    
    // 3. Flip the screens back
    document.getElementById('chatScreen').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    replayWelcomeAnimation();

    // 4. Clear the input fields so the old password doesn't sit there
    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';

    // 5. Force the password field back to hidden (Reset the eye icons)
    const pwdInput = document.getElementById('password');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');
        
    pwdInput.type = 'password';
    eyeOpen.style.display = 'block';
    eyeClosed.style.display = 'none';
    
    // 6. Hide any lingering error messages or popups
    hideMessages();
}

async function loadUserHistory() {
    document.getElementById('chatBox').innerHTML = ''; 
    try {
        const response = await fetch(`/api/history?user_id=${activeUserId}`);
        const data = await response.json();
        if (data.history) {
            data.history.forEach(msg => {
                appendMessage(msg.content[0].text, msg.role);
            });
        }
    }
    catch (err) {
        console.error("Failed to load history", err);
    }
}

function clearChat() {
    document.getElementById('clearChatModal').style.display = 'flex';
}

function closeClearChatModal() {
    document.getElementById('clearChatModal').style.display = 'none';
}

async function confirmClearChat() {
    closeClearChatModal();

    await fetch('/api/clear', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: activeUserId })
    }).catch(err => {
            console.error("Failed to clear backend history:", err);
        });

    document.getElementById('chatBox').innerHTML = '';

    appendMessage(`Hello ${getFirstName(activeUserName)}! How can I help you today?`, `assistant`);

}

async function sendMessage() {

    stopSpeechRecognition(true);

    const inputElement = document.getElementById('userInput');
    const chatBox = document.getElementById('chatBox');
    const messageText = inputElement.value.trim();

    if (!messageText) return;

    appendMessage(messageText, 'user');
    inputElement.value = '';
    const loadingDiv = appendMessage("Thinking...", 'assistant');

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: messageText, user_id: activeUserId }) 
        });
        const data = await response.json();
        if (data.reply) {
            loadingDiv.innerText = data.reply;
        }
        else {
            loadingDiv.innerText = "Error: " + (data.error || "Failed to get response");
        }
    }
    catch (err) {
        loadingDiv.innerText = "Error connecting to server.";
    }

    chatBox.scrollTop = chatBox.scrollHeight;

}

function appendMessage(text, role) {

    const chatBox = document.getElementById('chatBox');
    const msgDiv = document.createElement('div');

    msgDiv.className = `message ${role}`;
    msgDiv.innerText = text;

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    return msgDiv;

}

initializeSpeechRecognition();
