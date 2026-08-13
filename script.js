let activeUserId = null;
let activeUserName = "";
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
        
    if (!email) return showMessage("Please enter your email address.");
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
        
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        
        loadUserHistory();
    }
}

function deleteAccount() {
    // Show the modal and clear out any old text
    document.getElementById('deleteModal').style.display = 'flex';
    document.getElementById('deletePassword').value = '';
}

function closeDeleteModal() {
    // Hide the modal
    document.getElementById('deleteModal').style.display = 'none';
}

async function confirmDeleteAccount() {
    const password = document.getElementById('deletePassword').value.trim();
    
    if (!password) {
        alert("Please enter your password to confirm.");
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
            closeDeleteModal();
            signOut(); // Safely reset the UI to the sign-in screen
        } else {
            alert("Error: " + (data.error || "Failed to delete account"));
        }
    }
    catch (err) {
        alert("Failed to connect to server.");
        console.error(err);
    }
}

function signOut() {
    // 1. Ask for confirmation
    const isConfirmed = confirm("Are you sure you want to sign out?");
    if (!isConfirmed) return; // Stop the function if they cancel

    // 2. Clear the active session
    activeUserId = null;
    
    // 3. Flip the screens back
    document.getElementById('chatScreen').style.display = 'none';
    document.getElementById('authScreen').style.display = 'block';

    // 4. Clear the input fields so the old password doesn't sit there
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

async function clearChat() {

    // Ask for confirmation
    const isConfirmed = confirm("Are you sure you want to clear your entire chat history?\nThis cannot be undone!");
    if (!isConfirmed) return; // Stop the function if they cancel

    await fetch('/api/clear', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: activeUserId })
    }).catch(err => {
            console.error("Failed to clear backend history:", err);
        });

    document.getElementById('chatBox').innerHTML = '';

    appendMessage(`Hello ${activeUserName}! How can I help you today?`, `assistant`);

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
