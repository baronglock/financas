import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    onSnapshot,
    doc,
    deleteDoc,
    orderBy,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig, geminiApiKey } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado global
let userId = null;
let userEmail = null;
let userName = null;
let transactions = [];
let chatHistory = [];
let transactionsCollectionRef;
let chatHistoryCollectionRef;

// DOM Elements
const authModal = document.getElementById('auth-modal');
const mainContent = document.getElementById('main-content');
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const loadingOverlay = document.getElementById('loading-overlay');

// Mostrar/esconder loading
function showLoading(message = 'Processando...') {
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = message;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// Corrigir o problema das tabs
function switchToLogin() {
    console.log('Switching to login...');
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    authError.classList.add('hidden');
}

function switchToRegister() {
    console.log('Switching to register...');
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    authError.classList.add('hidden');
}

// Função para configurar os event listeners das tabs
function setupTabListeners() {
    const loginTabEl = document.getElementById('login-tab');
    const registerTabEl = document.getElementById('register-tab');

    if (loginTabEl && registerTabEl) {
        loginTabEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchToLogin();
        });

        registerTabEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchToRegister();
        });

        console.log('Tab listeners successfully attached');
    } else {
        console.error('Could not find tab elements');
        // Tentar novamente após um pequeno delay
        setTimeout(setupTabListeners, 100);
    }
}

// Configurar listeners quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTabListeners);
} else {
    setupTabListeners();
}

// Show error message
function showAuthError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
}

// Login handler
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    console.log('Attempting login with email:', email);
    showLoading('Acessando caderno...');

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('Login successful!', userCredential.user);
        // O onAuthStateChanged vai cuidar de esconder o modal e mostrar o dashboard
    } catch (error) {
        console.error("Login error:", error);
        let errorMessage = "Erro ao acessar.";
        if (error.code === 'auth/user-not-found') {
            errorMessage = "Usuário não encontrado.";
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = "Senha incorreta.";
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = "Endereço eletrônico inválido.";
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = "Credenciais inválidas.";
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = "Erro de conexão. Verifique sua internet.";
        }
        showAuthError(errorMessage);
        hideLoading();
    }
});

// Register handler
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    showLoading('Criando novo caderno...');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
            displayName: name
        });
    } catch (error) {
        console.error("Registration error:", error);
        let errorMessage = "Erro ao criar cadastro.";
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = "Este endereço já está cadastrado.";
        } else if (error.code === 'auth/weak-password') {
            errorMessage = "A senha deve ter pelo menos 6 caracteres.";
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = "Endereço eletrônico inválido.";
        }
        showAuthError(errorMessage);
        hideLoading();
    }
});

// Logout handler
logoutBtn.addEventListener('click', async () => {
    try {
        showLoading('Encerrando sessão...');
        await signOut(auth);
    } catch (error) {
        console.error("Logout error:", error);
        alert("Erro ao encerrar sessão.");
        hideLoading();
    }
});

// Auth state observer
onAuthStateChanged(auth, async (user) => {
    console.log('Auth state changed:', user);

    if (user) {
        console.log('User is logged in:', user.email);
        userId = user.uid;
        userEmail = user.email;
        userName = user.displayName || user.email.split('@')[0];

        // Garantir que os elementos existem antes de manipular
        if (userInfo) userInfo.innerHTML = `<span class="font-bold">Proprietário:</span> ${userName}`;
        if (authModal) authModal.classList.add('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');

        transactionsCollectionRef = collection(db, `users/${userId}/transactions`);
        chatHistoryCollectionRef = collection(db, `users/${userId}/gemini_chat_history`);

        setupListeners();
        hideLoading();
    } else {
        console.log('User is NOT logged in');
        userId = null;
        userEmail = null;
        userName = null;
        transactions = [];
        chatHistory = [];

        if (authModal) authModal.classList.remove('hidden');
        if (mainContent) mainContent.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');

        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();
        hideLoading();
    }
});

function setupListeners() {
    const qTransactions = query(transactionsCollectionRef, orderBy("timestamp", "desc"));
    onSnapshot(qTransactions, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUI();
    }, (error) => {
        console.error("Error fetching transactions:", error);
    });

    const qChat = query(chatHistoryCollectionRef, orderBy("timestamp", "asc"));
    onSnapshot(qChat, (snapshot) => {
        chatHistory = snapshot.docs.map(doc => doc.data());
        renderChat();
    }, (error) => {
        console.error("Error fetching chat:", error);
    });
}

// UI Elements
const transactionForm = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const typeInput = document.getElementById('type');
const transactionList = document.getElementById('transaction-list');
const currentBalanceEl = document.getElementById('current-balance');
const monthlyIncomeEl = document.getElementById('monthly-income');
const monthlyExpensesEl = document.getElementById('monthly-expenses');
const projectionDateInput = document.getElementById('projection-date');
const projectionResultEl = document.getElementById('projection-result');

const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-transaction-form');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const editIdInput = document.getElementById('edit-id');
const editDescriptionInput = document.getElementById('edit-description');
const editAmountInput = document.getElementById('edit-amount');
const editDateInput = document.getElementById('edit-date');
const editTypeInput = document.getElementById('edit-type');

const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
let transactionIdToDelete = null;

// Set today's date
if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
}

function renderUI() {
    renderTransactions();
    updateDashboard();
    updateProjection();
}

function formatDateVintage(date) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('pt-BR', options).toUpperCase();
}

function renderTransactions() {
    transactionList.innerHTML = '';

    if (transactions.length === 0) {
        transactionList.innerHTML = '<p class="text-center italic">Nenhum registro encontrado</p>';
        return;
    }

    const sortedTransactions = [...transactions].sort((a, b) => {
        const dateA = new Date(a.date + 'T03:00:00Z');
        const dateB = new Date(b.date + 'T03:00:00Z');
        return dateB - dateA;
    });

    let lastDate = null;
    sortedTransactions.forEach(tx => {
        const txDate = new Date(tx.date + 'T03:00:00Z');

        if (tx.date !== lastDate) {
            const dateHeader = document.createElement('div');
            dateHeader.className = 'date-stamp';
            dateHeader.textContent = formatDateVintage(txDate);
            transactionList.appendChild(dateHeader);
            lastDate = tx.date;
        }

        const isIncome = tx.type === 'income';
        const el = document.createElement('div');
        el.className = `transaction-item ${isIncome ? 'income' : ''} flex justify-between items-center fade-in`;
        el.innerHTML = `
            <div class="flex-1">
                <span class="font-bold">${tx.description}</span>
            </div>
            <div class="flex items-center gap-4">
                <span class="price-tag ${isIncome ? 'income' : 'expense'}">
                    ${isIncome ? '+' : '-'} R$ ${parseFloat(tx.amount).toFixed(2)}
                </span>
                <div class="flex gap-2">
                    <button data-id="${tx.id}" class="edit-btn text-coffee hover:text-charcoal">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button data-id="${tx.id}" class="delete-btn text-rust hover:text-charcoal">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>`;
        transactionList.appendChild(el);
    });
}

function updateDashboard() {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const currentMonth = now.getUTCMonth(), currentYear = now.getUTCFullYear();
    let balance = 0, monthlyIncome = 0, monthlyExpenses = 0;

    transactions.forEach(tx => {
        const txDate = new Date(tx.date + 'T03:00:00Z');
        const amount = parseFloat(tx.amount);
        if (txDate <= today) balance += tx.type === 'income' ? amount : -amount;
        if (txDate.getUTCMonth() === currentMonth && txDate.getUTCFullYear() === currentYear) {
            if (tx.type === 'income') monthlyIncome += amount; else monthlyExpenses += amount;
        }
    });

    currentBalanceEl.textContent = `R$ ${balance.toFixed(2)}`;
    monthlyIncomeEl.textContent = `R$ ${monthlyIncome.toFixed(2)}`;
    monthlyExpensesEl.textContent = `R$ ${monthlyExpenses.toFixed(2)}`;
}

function updateProjection() {
    const futureDateStr = projectionDateInput.value;
    if (!futureDateStr) {
         projectionResultEl.innerHTML = `<p class="text-sm italic">Selecione uma data</p>`;
        return;
    }
    const futureDate = new Date(futureDateStr + 'T03:00:00Z');
    let projectedBalance = 0;
    transactions.forEach(tx => {
        if (new Date(tx.date + 'T03:00:00Z') <= futureDate) {
            projectedBalance += tx.type === 'income' ? parseFloat(tx.amount) : -parseFloat(tx.amount);
        }
    });
    projectionResultEl.innerHTML = `
        <div class="stamp ${projectedBalance >= 0 ? 'income' : 'expense'}">
            R$ ${projectedBalance.toFixed(2)}
        </div>`;
}

projectionDateInput.addEventListener('change', updateProjection);

// Add transaction
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!descriptionInput.value || !amountInput.value || !dateInput.value) return;

    showLoading('Registrando...');
    try {
        await addDoc(transactionsCollectionRef, {
            description: descriptionInput.value,
            amount: parseFloat(amountInput.value),
            date: dateInput.value,
            type: typeInput.value,
            timestamp: serverTimestamp(),
            createdBy: userEmail
        });
        transactionForm.reset();
        dateInput.value = new Date().toISOString().split('T')[0];
        hideLoading();
    } catch (error) {
        console.error("Error adding transaction:", error);
        alert("Erro ao registrar movimento.");
        hideLoading();
    }
});

// Handle edit/delete
transactionList.addEventListener('click', async (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    const id = target.getAttribute('data-id');
    if (target.classList.contains('delete-btn')) {
        transactionIdToDelete = id;
        deleteConfirmModal.classList.remove('hidden');
    } else if (target.classList.contains('edit-btn')) {
        const txToEdit = transactions.find(t => t.id === id);
        if (txToEdit) {
            editIdInput.value = txToEdit.id;
            editDescriptionInput.value = txToEdit.description;
            editAmountInput.value = txToEdit.amount;
            editDateInput.value = txToEdit.date;
            editTypeInput.value = txToEdit.type;
            editModal.classList.remove('hidden');
        }
    }
});

// Edit handlers
cancelEditBtn.addEventListener('click', () => editModal.classList.add('hidden'));

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editIdInput.value;
    const updatedTx = {
        description: editDescriptionInput.value,
        amount: parseFloat(editAmountInput.value),
        date: editDateInput.value,
        type: editTypeInput.value,
        lastModified: serverTimestamp(),
        modifiedBy: userEmail
    };

    showLoading('Atualizando...');
    try {
        await updateDoc(doc(transactionsCollectionRef, id), updatedTx);
        editModal.classList.add('hidden');
        hideLoading();
    } catch (error) {
        console.error("Error updating transaction:", error);
        alert("Erro ao atualizar registro.");
        hideLoading();
    }
});

// Delete handlers
cancelDeleteBtn.addEventListener('click', () => {
    deleteConfirmModal.classList.add('hidden');
    transactionIdToDelete = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (transactionIdToDelete) {
        showLoading('Removendo...');
        try {
            await deleteDoc(doc(transactionsCollectionRef, transactionIdToDelete));
            deleteConfirmModal.classList.add('hidden');
            transactionIdToDelete = null;
            hideLoading();
        } catch (error) {
            console.error("Error deleting transaction:", error);
            alert("Erro ao remover registro.");
            hideLoading();
        }
    }
});

// Chat AI
const aiForm = document.getElementById('ai-form');
const aiPromptInput = document.getElementById('ai-prompt');
const chatBox = document.getElementById('chat-box');
const aiLoading = document.getElementById('ai-loading');

function renderChat() {
    chatBox.innerHTML = '';
    chatHistory.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = 'telegram-message fade-in';
        bubble.innerHTML = `<p class="text-sm">${msg.content.replace(/\n/g, '<br>')}</p>`;
        if (msg.role === 'user') {
            bubble.style.textAlign = 'right';
            bubble.style.marginLeft = '20%';
        } else {
            bubble.style.marginRight = '20%';
        }
        chatBox.appendChild(bubble);
    });
    if(chatBox.scrollHeight > chatBox.clientHeight) chatBox.scrollTop = chatBox.scrollHeight;
}

aiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userPrompt = aiPromptInput.value.trim();
    if (!userPrompt) return;
    aiPromptInput.value = '';
    aiLoading.classList.remove('hidden');

    try {
        await addDoc(chatHistoryCollectionRef, {
            role: 'user',
            content: userPrompt,
            timestamp: serverTimestamp()
        });
        await callGeminiAPI(userPrompt);
    } catch (error) {
        console.error("Error in chat:", error);
        aiLoading.classList.add('hidden');
    }
});

async function callGeminiAPI(userPrompt) {
    const model = "gemini-1.5-flash-latest";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

    const balance = parseFloat(currentBalanceEl.textContent.replace('R$ ', ''));
    const income = parseFloat(monthlyIncomeEl.textContent.replace('R$ ', ''));
    const expenses = parseFloat(monthlyExpensesEl.textContent.replace('R$ ', ''));

    let dataSummary = `
        DADOS FINANCEIROS - ${userName.toUpperCase()}
        DATA: ${new Date().toLocaleDateString('pt-BR')}
        =====================================
        SALDO ATUAL: R$ ${balance.toFixed(2)}
        ENTRADAS MENSAIS: R$ ${income.toFixed(2)}
        SAÍDAS MENSAIS: R$ ${expenses.toFixed(2)}
        FLUXO MENSAL: R$ ${(income - expenses).toFixed(2)}
        =====================================
    `;

    const systemInstruction = {
        parts: [{
            text: "Você é um consultor financeiro do início do século XX, com uma abordagem tradicional e conservadora. Use linguagem formal mas acessível, como se estivesse escrevendo um telegrama ou carta. Seja direto, prático e use termos da época quando apropriado. Responda em português brasileiro formal."
        }]
    };

    const historyForAPI = chatHistory.slice(-6).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    const payload = {
        contents: [...historyForAPI, {
            role: "user",
            parts: [{
                text: `${dataSummary}\n\nCONSULTA: ${userPrompt}`
            }]
        }],
        systemInstruction: systemInstruction
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`API error: ${response.statusText}`);

        const result = await response.json();
        const modelResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Lamento, não foi possível processar sua consulta.";

        await addDoc(chatHistoryCollectionRef, {
            role: 'model',
            content: modelResponse,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Erro Gemini:", error);
        await addDoc(chatHistoryCollectionRef, {
            role: 'model',
            content: 'Desculpe, houve uma falha no processamento. Tente novamente.',
            timestamp: serverTimestamp()
        });
    } finally {
        aiLoading.classList.add('hidden');
    }
}

// Inicialização
showLoading('Verificando credenciais...');