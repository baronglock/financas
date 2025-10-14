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
console.log('Inicializando Firebase...');
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
console.log('Firebase inicializado com sucesso!');

// Estado global
let userId = null;
let userEmail = null;
let userName = null;
let transactions = [];
let chatHistory = [];
let transactionsCollectionRef;
let chatHistoryCollectionRef;

// Aguardar DOM carregar completamente
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado, inicializando app...');

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

    // Verificar se todos os elementos foram encontrados
    console.log('Elementos encontrados:', {
        authModal: !!authModal,
        mainContent: !!mainContent,
        loginForm: !!loginForm,
        registerForm: !!registerForm
    });

    // Funções auxiliares
    function showLoading(message = 'Processando...') {
        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.textContent = message;
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    function showAuthError(message) {
        if (authError) {
            authError.textContent = message;
            authError.classList.remove('hidden');
        }
    }

    // Configurar tabs
    function switchToLogin() {
        console.log('Alternando para login');
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        authError.classList.add('hidden');
    }

    function switchToRegister() {
        console.log('Alternando para cadastro');
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        authError.classList.add('hidden');
    }

    // Event listeners das tabs
    if (loginTab) {
        loginTab.addEventListener('click', (e) => {
            e.preventDefault();
            switchToLogin();
        });
    }

    if (registerTab) {
        registerTab.addEventListener('click', (e) => {
            e.preventDefault();
            switchToRegister();
        });
    }

    // Login handler
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            console.log('Tentando login com:', email);
            showLoading('Acessando caderno...');

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                console.log('Login bem-sucedido!', userCredential.user.email);
                // onAuthStateChanged vai cuidar da transição de tela
            } catch (error) {
                console.error('Erro no login:', error);
                hideLoading();

                let errorMessage = 'Erro ao acessar. ';
                switch(error.code) {
                    case 'auth/user-not-found':
                        errorMessage = 'Usuário não encontrado.';
                        break;
                    case 'auth/wrong-password':
                        errorMessage = 'Senha incorreta.';
                        break;
                    case 'auth/invalid-email':
                        errorMessage = 'Email inválido.';
                        break;
                    case 'auth/invalid-credential':
                        errorMessage = 'Email ou senha incorretos.';
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = 'Muitas tentativas. Aguarde alguns minutos.';
                        break;
                    default:
                        errorMessage += error.message;
                }
                showAuthError(errorMessage);
            }
        });
    }

    // Register handler
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;

            console.log('Tentando criar conta para:', email);
            showLoading('Criando novo caderno...');

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                console.log('Conta criada com sucesso!');

                // Atualizar o nome do usuário
                await updateProfile(userCredential.user, {
                    displayName: name
                });
                console.log('Perfil atualizado com nome:', name);
                // onAuthStateChanged vai cuidar da transição

            } catch (error) {
                console.error('Erro ao criar conta:', error);
                hideLoading();

                let errorMessage = 'Erro ao criar conta. ';
                switch(error.code) {
                    case 'auth/email-already-in-use':
                        errorMessage = 'Este email já está cadastrado.';
                        break;
                    case 'auth/weak-password':
                        errorMessage = 'A senha deve ter pelo menos 6 caracteres.';
                        break;
                    case 'auth/invalid-email':
                        errorMessage = 'Email inválido.';
                        break;
                    default:
                        errorMessage += error.message;
                }
                showAuthError(errorMessage);
            }
        });
    }

    // Logout handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            console.log('Fazendo logout...');
            showLoading('Encerrando sessão...');
            try {
                await signOut(auth);
                console.log('Logout bem-sucedido');
            } catch (error) {
                console.error('Erro no logout:', error);
                hideLoading();
                alert('Erro ao sair. Tente novamente.');
            }
        });
    }

    // Auth state observer - MAIS IMPORTANTE!
    onAuthStateChanged(auth, (user) => {
        console.log('Estado de autenticação mudou:', user ? user.email : 'não autenticado');

        if (user) {
            // Usuário está logado
            userId = user.uid;
            userEmail = user.email;
            userName = user.displayName || user.email.split('@')[0];

            console.log('Configurando interface para usuário:', userName);

            // Atualizar UI
            if (userInfo) userInfo.innerHTML = `<span class="font-bold">Proprietário:</span> ${userName}`;

            // IMPORTANTE: Esconder modal de auth e mostrar conteúdo principal
            if (authModal) {
                authModal.classList.add('hidden');
                console.log('Modal de auth escondido');
            }
            if (mainContent) {
                mainContent.classList.remove('hidden');
                console.log('Conteúdo principal mostrado');
            }
            if (logoutBtn) {
                logoutBtn.classList.remove('hidden');
            }

            // Configurar coleções do Firestore
            transactionsCollectionRef = collection(db, `users/${userId}/transactions`);
            chatHistoryCollectionRef = collection(db, `users/${userId}/gemini_chat_history`);

            // Configurar listeners do Firestore
            setupFirestoreListeners();

            // Esconder loading
            hideLoading();

        } else {
            // Usuário não está logado
            console.log('Usuário deslogado, mostrando tela de login');

            userId = null;
            userEmail = null;
            userName = null;
            transactions = [];
            chatHistory = [];

            // Mostrar modal de auth e esconder conteúdo
            if (authModal) {
                authModal.classList.remove('hidden');
            }
            if (mainContent) {
                mainContent.classList.add('hidden');
            }
            if (logoutBtn) {
                logoutBtn.classList.add('hidden');
            }

            // Limpar formulários
            if (loginForm) loginForm.reset();
            if (registerForm) registerForm.reset();

            hideLoading();
        }
    });

    // Configurar listeners do Firestore
    function setupFirestoreListeners() {
        console.log('Configurando listeners do Firestore...');

        // Transações
        const qTransactions = query(transactionsCollectionRef, orderBy("timestamp", "desc"));
        onSnapshot(qTransactions,
            (snapshot) => {
                console.log('Transações recebidas:', snapshot.size);
                transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderUI();
            },
            (error) => {
                console.error('Erro ao buscar transações:', error);
            }
        );

        // Chat
        const qChat = query(chatHistoryCollectionRef, orderBy("timestamp", "asc"));
        onSnapshot(qChat,
            (snapshot) => {
                console.log('Mensagens do chat recebidas:', snapshot.size);
                chatHistory = snapshot.docs.map(doc => doc.data());
                renderChat();
            },
            (error) => {
                console.error('Erro ao buscar chat:', error);
            }
        );
    }

    // Configurar elementos da UI
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

    // Configurar data padrão
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Funções de renderização
    function renderUI() {
        renderTransactions();
        updateDashboard();
        updateProjection();
    }

    function renderTransactions() {
        if (!transactionList) return;

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
                dateHeader.textContent = txDate.toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }).toUpperCase();
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
        if (!currentBalanceEl || !monthlyIncomeEl || !monthlyExpensesEl) return;

        const now = new Date();
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const currentMonth = now.getUTCMonth();
        const currentYear = now.getUTCFullYear();

        let balance = 0;
        let monthlyIncome = 0;
        let monthlyExpenses = 0;

        transactions.forEach(tx => {
            const txDate = new Date(tx.date + 'T03:00:00Z');
            const amount = parseFloat(tx.amount);

            if (txDate <= today) {
                balance += tx.type === 'income' ? amount : -amount;
            }

            if (txDate.getUTCMonth() === currentMonth && txDate.getUTCFullYear() === currentYear) {
                if (tx.type === 'income') {
                    monthlyIncome += amount;
                } else {
                    monthlyExpenses += amount;
                }
            }
        });

        currentBalanceEl.textContent = `R$ ${balance.toFixed(2)}`;
        monthlyIncomeEl.textContent = `R$ ${monthlyIncome.toFixed(2)}`;
        monthlyExpensesEl.textContent = `R$ ${monthlyExpenses.toFixed(2)}`;
    }

    function updateProjection() {
        if (!projectionDateInput || !projectionResultEl) return;

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

    // Event listeners para projeção
    if (projectionDateInput) {
        projectionDateInput.addEventListener('change', updateProjection);
    }

    // Adicionar transação
    if (transactionForm) {
        transactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!descriptionInput.value || !amountInput.value || !dateInput.value) {
                alert('Preencha todos os campos');
                return;
            }

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

                console.log('Transação adicionada com sucesso');
                transactionForm.reset();
                dateInput.value = new Date().toISOString().split('T')[0];
                hideLoading();
            } catch (error) {
                console.error('Erro ao adicionar transação:', error);
                hideLoading();
                alert('Erro ao registrar movimento: ' + error.message);
            }
        });
    }

    // Delegação de eventos para editar/excluir
    if (transactionList) {
        transactionList.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const id = button.getAttribute('data-id');

            if (button.classList.contains('delete-btn')) {
                if (confirm('Deseja realmente excluir este registro?')) {
                    try {
                        await deleteDoc(doc(transactionsCollectionRef, id));
                        console.log('Transação excluída');
                    } catch (error) {
                        console.error('Erro ao excluir:', error);
                        alert('Erro ao excluir registro');
                    }
                }
            } else if (button.classList.contains('edit-btn')) {
                // Implementar edição se necessário
                alert('Função de edição em desenvolvimento');
            }
        });
    }

    // Chat AI
    const aiForm = document.getElementById('ai-form');
    const aiPromptInput = document.getElementById('ai-prompt');
    const chatBox = document.getElementById('chat-box');
    const aiLoading = document.getElementById('ai-loading');

    function renderChat() {
        if (!chatBox) return;

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

        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Chat form handler
    if (aiForm) {
        aiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userPrompt = aiPromptInput.value.trim();

            if (!userPrompt) return;

            aiPromptInput.value = '';
            if (aiLoading) aiLoading.classList.remove('hidden');

            try {
                await addDoc(chatHistoryCollectionRef, {
                    role: 'user',
                    content: userPrompt,
                    timestamp: serverTimestamp()
                });

                await callGeminiAPI(userPrompt);
            } catch (error) {
                console.error('Erro no chat:', error);
                if (aiLoading) aiLoading.classList.add('hidden');
            }
        });
    }

    async function callGeminiAPI(userPrompt) {
        const model = "gemini-1.5-flash-latest";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

        const balance = parseFloat(currentBalanceEl.textContent.replace('R$ ', ''));
        const income = parseFloat(monthlyIncomeEl.textContent.replace('R$ ', ''));
        const expenses = parseFloat(monthlyExpensesEl.textContent.replace('R$ ', ''));

        const dataSummary = `
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
                text: "Você é um consultor financeiro tradicional. Use linguagem formal mas acessível. Seja direto e prático. Responda em português brasileiro."
            }]
        };

        const payload = {
            contents: [{
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
            const modelResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível processar sua consulta.";

            await addDoc(chatHistoryCollectionRef, {
                role: 'model',
                content: modelResponse,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error('Erro Gemini:', error);
            await addDoc(chatHistoryCollectionRef, {
                role: 'model',
                content: 'Desculpe, houve uma falha no processamento.',
                timestamp: serverTimestamp()
            });
        } finally {
            if (aiLoading) aiLoading.classList.add('hidden');
        }
    }

    // Verificar estado inicial
    console.log('App inicializado. Aguardando autenticação...');
    showLoading('Verificando credenciais...');
});