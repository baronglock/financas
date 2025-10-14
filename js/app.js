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
function showLoading(message = 'Carregando...') {
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = message;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// Auth Tab Switching
loginTab.addEventListener('click', () => {
    loginTab.classList.add('text-white', 'border-b-2', 'border-indigo-600');
    loginTab.classList.remove('text-gray-400');
    registerTab.classList.remove('text-white', 'border-b-2', 'border-indigo-600');
    registerTab.classList.add('text-gray-400');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    authError.classList.add('hidden');
});

registerTab.addEventListener('click', () => {
    registerTab.classList.add('text-white', 'border-b-2', 'border-indigo-600');
    registerTab.classList.remove('text-gray-400');
    loginTab.classList.remove('text-white', 'border-b-2', 'border-indigo-600');
    loginTab.classList.add('text-gray-400');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    authError.classList.add('hidden');
});

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

    showLoading('Fazendo login...');
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login error:", error);
        let errorMessage = "Erro ao fazer login.";
        if (error.code === 'auth/user-not-found') {
            errorMessage = "Usuário não encontrado.";
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = "Senha incorreta.";
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = "Email inválido.";
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = "Credenciais inválidas. Verifique seu email e senha.";
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

    showLoading('Criando sua conta...');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Update the user profile with their name
        await updateProfile(userCredential.user, {
            displayName: name
        });
    } catch (error) {
        console.error("Registration error:", error);
        let errorMessage = "Erro ao criar conta.";
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = "Este email já está cadastrado.";
        } else if (error.code === 'auth/weak-password') {
            errorMessage = "A senha deve ter pelo menos 6 caracteres.";
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = "Email inválido.";
        }
        showAuthError(errorMessage);
        hideLoading();
    }
});

// Logout handler
logoutBtn.addEventListener('click', async () => {
    try {
        showLoading('Saindo...');
        await signOut(auth);
    } catch (error) {
        console.error("Logout error:", error);
        alert("Erro ao sair. Tente novamente.");
        hideLoading();
    }
});

// Auth state observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        userId = user.uid;
        userEmail = user.email;
        userName = user.displayName || user.email.split('@')[0];

        // Update UI
        userInfo.textContent = `Conectado como: ${userName} (${userEmail})`;
        authModal.classList.add('hidden');
        mainContent.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');

        // Setup Firebase references
        transactionsCollectionRef = collection(db, `users/${userId}/transactions`);
        chatHistoryCollectionRef = collection(db, `users/${userId}/gemini_chat_history`);

        setupListeners();
        hideLoading();
    } else {
        // User is signed out
        userId = null;
        userEmail = null;
        userName = null;
        transactions = [];
        chatHistory = [];

        // Update UI
        authModal.classList.remove('hidden');
        mainContent.classList.add('hidden');
        logoutBtn.classList.add('hidden');

        // Clear forms
        loginForm.reset();
        registerForm.reset();
        hideLoading();
    }
});

function setupListeners() {
    // Listen to transactions
    const qTransactions = query(transactionsCollectionRef, orderBy("timestamp", "desc"));
    onSnapshot(qTransactions, (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUI();
    }, (error) => {
        console.error("Error fetching transactions:", error);
    });

    // Listen to chat history
    const qChat = query(chatHistoryCollectionRef, orderBy("timestamp", "asc"));
    onSnapshot(qChat, (snapshot) => {
        chatHistory = snapshot.docs.map(doc => doc.data());
        renderChat();
    }, (error) => {
        console.error("Error fetching chat:", error);
    });
}

// --- LÓGICA DA INTERFACE (UI) ---
const transactionForm = document.getElementById('transaction-form');
const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const typeInput = document.getElementById('type');
const transactionList = document.getElementById('transaction-list');
const currentBalanceEl = document.getElementById('current-balance');
const currentBalanceLabel = document.getElementById('current-balance-label');
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

// Set today's date as default
dateInput.value = new Date().toISOString().split('T')[0];

function renderUI() {
    renderTransactions();
    updateDashboard();
    updateProjection();
}

function formatDateHeader(date) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);
    const compareDate = new Date(date);
    compareDate.setUTCHours(0, 0, 0, 0);

    if (compareDate.getTime() === today.getTime()) return `Hoje, ${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`;
    if (compareDate.getTime() === tomorrow.getTime()) return `Amanhã, ${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`;
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderTransactions() {
    transactionList.innerHTML = '';
    if (transactions.length === 0) {
        transactionList.innerHTML = '<p class="text-gray-400">Nenhuma transação registrada ainda.</p>';
        return;
    }

    // Ordena transações por data (mais recente primeiro)
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
            dateHeader.className = 'pt-4 pb-1';
            dateHeader.innerHTML = `<h3 class="text-sm font-semibold text-indigo-400">${formatDateHeader(txDate)}</h3>`;
            transactionList.appendChild(dateHeader);
            lastDate = tx.date;
        }

        const isIncome = tx.type === 'income';
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center bg-gray-700/50 p-3 rounded-lg border border-gray-700 fade-in';
        el.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="p-2 rounded-full ${isIncome ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${isIncome ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />'}</svg>
                </div>
                <div>
                    <p class="font-semibold text-gray-200">${tx.description}</p>
                </div>
            </div>
            <div class="flex items-center space-x-3">
                <p class="font-bold text-right ${isIncome ? 'text-green-500' : 'text-red-500'}">${isIncome ? '+' : '-'} R$ ${parseFloat(tx.amount).toFixed(2)}</p>
                <div class="flex space-x-2">
                     <button data-id="${tx.id}" class="edit-btn text-gray-500 hover:text-indigo-400 p-1 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                     <button data-id="${tx.id}" class="delete-btn text-gray-500 hover:text-red-500 p-1 transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                </div>
            </div>`;
        transactionList.appendChild(el);
    });
}

function updateDashboard() {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    currentBalanceLabel.textContent = `Saldo em ${now.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`;
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
         projectionResultEl.innerHTML = `<p class="text-gray-400">Selecione uma data para ver a projeção.</p>`;
        return;
    }
    const futureDate = new Date(futureDateStr + 'T03:00:00Z');
    let projectedBalance = 0;
    transactions.forEach(tx => {
        if (new Date(tx.date + 'T03:00:00Z') <= futureDate) {
            projectedBalance += tx.type === 'income' ? parseFloat(tx.amount) : -parseFloat(tx.amount);
        }
    });
    projectionResultEl.innerHTML = `<span class="text-gray-300">Saldo projetado:</span> <span class="${projectedBalance >= 0 ? 'text-green-500' : 'text-red-500'}">R$ ${projectedBalance.toFixed(2)}</span>`;
}

projectionDateInput.addEventListener('change', updateProjection);

// Add new transaction
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!descriptionInput.value || !amountInput.value || !dateInput.value) return;

    showLoading('Adicionando transação...');
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
        alert("Erro ao adicionar transação. Tente novamente.");
        hideLoading();
    }
});

// Handle edit and delete buttons
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

// Edit modal handlers
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

    showLoading('Atualizando transação...');
    try {
        await updateDoc(doc(transactionsCollectionRef, id), updatedTx);
        editModal.classList.add('hidden');
        hideLoading();
    } catch (error) {
        console.error("Error updating transaction:", error);
        alert("Erro ao atualizar transação. Tente novamente.");
        hideLoading();
    }
});

// Delete modal handlers
cancelDeleteBtn.addEventListener('click', () => {
    deleteConfirmModal.classList.add('hidden');
    transactionIdToDelete = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (transactionIdToDelete) {
        showLoading('Excluindo transação...');
        try {
            await deleteDoc(doc(transactionsCollectionRef, transactionIdToDelete));
            deleteConfirmModal.classList.add('hidden');
            transactionIdToDelete = null;
            hideLoading();
        } catch (error) {
            console.error("Error deleting transaction:", error);
            alert("Erro ao excluir transação. Tente novamente.");
            hideLoading();
        }
    }
});

// --- LÓGICA DO ASSISTENTE GEMINI ---
const aiForm = document.getElementById('ai-form');
const aiPromptInput = document.getElementById('ai-prompt');
const chatBox = document.getElementById('chat-box');
const aiLoading = document.getElementById('ai-loading');

function renderChat() {
    chatBox.innerHTML = '';
    chatHistory.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `${msg.role === 'user' ? 'chat-bubble-user self-end' : 'chat-bubble-model self-start'} p-3 rounded-lg max-w-xs md:max-w-md mb-2 fade-in`;
        bubble.innerHTML = `<p class="text-sm">${msg.content.replace(/\n/g, '<br>')}</p>`;
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
    aiLoading.classList.add('flex');

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
        aiLoading.classList.remove('flex');
    }
});

async function callGeminiAPI(userPrompt) {
    const model = "gemini-1.5-flash-latest";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

    const balance = parseFloat(currentBalanceEl.textContent.replace('R$ ', ''));
    const income = parseFloat(monthlyIncomeEl.textContent.replace('R$ ', ''));
    const expenses = parseFloat(monthlyExpensesEl.textContent.replace('R$ ', ''));
    const upcoming = transactions.filter(t => new Date(t.date) >= new Date()).slice(0, 5);

    let dataSummary = `
        Resumo Financeiro de ${userName} (Data: ${new Date().toLocaleDateString('pt-BR')}):
        - Saldo Atual: R$ ${balance.toFixed(2)}
        - Entradas no Mês: R$ ${income.toFixed(2)}
        - Saídas no Mês: R$ ${expenses.toFixed(2)}
        - Fluxo Mensal: R$ ${(income - expenses).toFixed(2)}
        Próximas 5 Transações:
        ${upcoming.length > 0 ? upcoming.map(t => `${t.date}: ${t.description} (${t.type === 'income' ? '+' : '-'} R$${t.amount})`).join('\n') : 'Nenhuma transação futura.'}
    `;

    const systemInstruction = {
        parts: [{
            text: "Você é um analista financeiro pessoal especializado. Seus conselhos devem ser práticos, realistas e baseados nos dados financeiros fornecidos. Analise a situação do usuário e responda de forma clara, direta e em português do Brasil. Seja amigável e encorajador, mas também honesto sobre a situação financeira. Sempre forneça insights acionáveis."
        }]
    };

    const historyForAPI = chatHistory.slice(-10).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    const payload = {
        contents: [...historyForAPI, {
            role: "user",
            parts: [{
                text: `Baseado neste resumo:\n${dataSummary}\n\nMinha pergunta: ${userPrompt}`
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
        const modelResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar sua solicitação.";

        await addDoc(chatHistoryCollectionRef, {
            role: 'model',
            content: modelResponse,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao chamar a API do Gemini:", error);
        await addDoc(chatHistoryCollectionRef, {
            role: 'model',
            content: 'Ocorreu um erro ao processar sua pergunta. Por favor, tente novamente.',
            timestamp: serverTimestamp()
        });
    } finally {
        aiLoading.classList.add('hidden');
        aiLoading.classList.remove('flex');
    }
}

// Inicialização - mostrar tela de carregamento
showLoading('Verificando autenticação...');