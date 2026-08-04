let activeUserId = null;
let authMode = 'signin'; 

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
    const pwHint = document.getElementById('pwHint');

    if (authMode === 'signin') {
        authMode = 'signup';
        title.innerText = 'Register';
        primaryBtn.innerText = 'Register';
        primaryBtn.onclick = signUp;
        secondaryBtn.innerText = 'Back to Sign In';
        pwHint.style.display = 'block';
    }
    else {
        authMode = 'signin';
        title.innerText = 'Sign In';
        primaryBtn.innerText = 'Sign In';
        primaryBtn.onclick = signIn;
        secondaryBtn.innerText = 'Create an Account';
        pwHint.style.display = 'none';
    }
}

async function signUp() {
    hideMessages();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
        
    if (!email || !password) return showMessage("Please enter email and password.");

    const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    
    if (data.error) {
        showMessage(data.error);
    }
    else {
        alert("Registration successful! You can now log in.");
        toggleMode(); 
        document.getElementById('password').value = '';
    }
}

async function signIn() {
    hideMessages();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
        
    if (!email || !password) return showMessage("Please enter email and password.");

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
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('chatScreen').style.display = 'flex';
        document.getElementById('chatHeaderTitle').innerText = activeUserId;
        
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        
        loadUserHistory();
    }
}

function logOut() {

    activeUserId = null;
    document.getElementById('chatScreen').style.display = 'none';
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('chatBox').innerHTML = '';

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

async function clearChat() {

    await fetch('/api/clear', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: activeUserId })
    });

    document.getElementById('chatBox').innerHTML = '';

    appendMessage("Hello! How can I help you today?", "assistant");

}

async function sendMessage() {

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