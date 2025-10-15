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

        // Ordenar por data: cronológico (mais antigo primeiro)
        const sortedTransactions = [...transactions].sort((a, b) => {
            const dateA = new Date(a.date + 'T03:00:00Z');
            const dateB = new Date(b.date + 'T03:00:00Z');
            return dateA - dateB;
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
        // Pegar a data de hoje no fuso horário local (início do dia)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        today.setHours(23, 59, 59, 999); // Fim do dia de hoje

        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let balance = 0;
        let monthlyIncome = 0;
        let monthlyExpenses = 0;

        transactions.forEach(tx => {
            // Criar data da transação no fuso local
            const txDate = new Date(tx.date + 'T00:00:00');
            const amount = parseFloat(tx.amount);

            // Incluir transações até o final do dia de hoje
            if (txDate <= today) {
                balance += tx.type === 'income' ? amount : -amount;
            }

            if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
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
        projectionDateInput.addEventListener('change', () => {
            updateProjection();
            // Mostrar botão de gráfico quando há uma data selecionada
            const showChartBtn = document.getElementById('show-chart-btn');
            if (showChartBtn && projectionDateInput.value) {
                showChartBtn.classList.remove('hidden');
            }
        });
    }

    // Gráfico de projeção
    let balanceChart = null;
    const showChartBtn = document.getElementById('show-chart-btn');
    const chartContainer = document.getElementById('chart-container');
    const balanceChartCanvas = document.getElementById('balance-chart');

    if (showChartBtn) {
        showChartBtn.addEventListener('click', () => {
            if (chartContainer.classList.contains('hidden')) {
                chartContainer.classList.remove('hidden');
                showChartBtn.textContent = 'Ocultar Gráfico';
                renderBalanceChart();
            } else {
                chartContainer.classList.add('hidden');
                showChartBtn.textContent = 'Ver Gráfico';
            }
        });
    }

    function renderBalanceChart() {
        if (!projectionDateInput.value || !balanceChartCanvas) return;

        const futureDate = new Date(projectionDateInput.value + 'T03:00:00Z');
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        // Criar array de datas do hoje até a data futura
        const dates = [];
        const balances = [];

        // Ordenar transações por data
        const sortedTx = [...transactions].sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
        });

        // Calcular saldo acumulado para cada data
        let currentDate = new Date(today);
        let runningBalance = 0;

        // Primeiro, calcular saldo inicial (até hoje)
        sortedTx.forEach(tx => {
            const txDate = new Date(tx.date + 'T03:00:00Z');
            if (txDate <= today) {
                const amount = parseFloat(tx.amount);
                runningBalance += tx.type === 'income' ? amount : -amount;
            }
        });

        // Adicionar ponto inicial (hoje)
        dates.push(today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        balances.push(runningBalance);

        // Calcular projeção dia a dia
        currentDate.setDate(currentDate.getDate() + 1);

        while (currentDate <= futureDate) {
            // Verificar se há transações neste dia
            sortedTx.forEach(tx => {
                const txDate = new Date(tx.date + 'T03:00:00Z');
                if (txDate.toDateString() === currentDate.toDateString()) {
                    const amount = parseFloat(tx.amount);
                    runningBalance += tx.type === 'income' ? amount : -amount;
                }
            });

            dates.push(currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
            balances.push(runningBalance);

            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Destruir gráfico anterior se existir
        if (balanceChart) {
            balanceChart.destroy();
        }

        // Criar novo gráfico
        const ctx = balanceChartCanvas.getContext('2d');
        balanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Saldo Projetado (R$)',
                    data: balances,
                    borderColor: '#8B4513',
                    backgroundColor: 'rgba(139, 69, 19, 0.1)',
                    fill: true,
                    tension: 0.2,
                    borderWidth: 2,
                    pointBackgroundColor: '#8B4513',
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            font: {
                                family: "'Courier Prime', monospace",
                                size: 12
                            },
                            color: '#2F4F4F'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'R$ ' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toFixed(0);
                            },
                            font: {
                                family: "'Courier Prime', monospace"
                            },
                            color: '#2F4F4F'
                        },
                        grid: {
                            color: 'rgba(139, 69, 19, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: {
                                family: "'Courier Prime', monospace",
                                size: 10
                            },
                            color: '#2F4F4F'
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
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

    // Modal de edição
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-transaction-form');
    const editIdInput = document.getElementById('edit-id');
    const editDescriptionInput = document.getElementById('edit-description');
    const editAmountInput = document.getElementById('edit-amount');
    const editDateInput = document.getElementById('edit-date');
    const editTypeInput = document.getElementById('edit-type');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    function openEditModal(transaction) {
        if (!editModal || !editForm) return;

        editIdInput.value = transaction.id;
        editDescriptionInput.value = transaction.description;
        editAmountInput.value = transaction.amount;
        editDateInput.value = transaction.date;
        editTypeInput.value = transaction.type;

        editModal.classList.remove('hidden');
    }

    function closeEditModal() {
        if (editModal) {
            editModal.classList.add('hidden');
            editForm.reset();
        }
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', closeEditModal);
    }

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = editIdInput.value;
            const updatedData = {
                description: editDescriptionInput.value,
                amount: parseFloat(editAmountInput.value),
                date: editDateInput.value,
                type: editTypeInput.value
            };

            showLoading('Salvando alterações...');

            try {
                await updateDoc(doc(transactionsCollectionRef, id), updatedData);
                console.log('Transação atualizada com sucesso');
                closeEditModal();
                hideLoading();
            } catch (error) {
                console.error('Erro ao atualizar transação:', error);
                hideLoading();
                alert('Erro ao salvar alterações: ' + error.message);
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
                const transaction = transactions.find(tx => tx.id === id);
                if (transaction) {
                    openEditModal(transaction);
                }
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
        const model = "gemini-2.0-flash-exp";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

        const balance = parseFloat(currentBalanceEl.textContent.replace('R$ ', ''));
        const income = parseFloat(monthlyIncomeEl.textContent.replace('R$ ', ''));
        const expenses = parseFloat(monthlyExpensesEl.textContent.replace('R$ ', ''));

        const dataSummary = `[DADOS FINANCEIROS]
Saldo atual: R$ ${balance.toFixed(2)}
Entradas do mês: R$ ${income.toFixed(2)}
Saídas do mês: R$ ${expenses.toFixed(2)}
Fluxo mensal: R$ ${(income - expenses).toFixed(2)}`;

        const systemInstruction = {
            parts: [{
                text: `Você é um assistente financeiro prático e direto. REGRAS IMPORTANTES:
- Você pode usar o nome do usuário ocasionalmente (1 em cada 4-5 mensagens), mas não force em todas as respostas
- Seja ultra-conciso: máximo 3-4 frases curtas
- Use linguagem casual, simples e objetiva
- Não repita informações já mencionadas na conversa
- Quando algo já foi discutido, apenas complemente ou ajuste, não recalcule tudo
- Vá direto ao ponto sem explicações longas
- Use quebras de linha para organizar quando necessário`
            }]
        };

        // Construir histórico de conversa completo
        const contents = [];

        // Adicionar mensagens anteriores do histórico (últimas 8 mensagens)
        const recentHistory = chatHistory.slice(-8);

        // Contador de mensagens desde o último envio de dados
        let messagesSinceData = 0;
        for (let i = recentHistory.length - 1; i >= 0; i--) {
            if (recentHistory[i].role === 'user' && recentHistory[i].content.includes('[DADOS FINANCEIROS]')) {
                break;
            }
            messagesSinceData++;
        }

        recentHistory.forEach(msg => {
            if (msg.role === 'user') {
                contents.push({
                    role: "user",
                    parts: [{ text: msg.content }]
                });
            } else if (msg.role === 'model') {
                contents.push({
                    role: "model",
                    parts: [{ text: msg.content }]
                });
            }
        });

        // Enviar dados financeiros apenas:
        // 1. Se é a primeira mensagem (histórico vazio)
        // 2. Se passaram 5+ mensagens desde último envio
        // 3. Se a pergunta menciona "saldo", "quanto", "valor", "balanço"
        const needsFinancialData =
            chatHistory.length === 0 ||
            messagesSinceData >= 5 ||
            /saldo|quanto|valor|balan[çc]o|gastar|sobrar|entrad|sa[íi]d/i.test(userPrompt);

        // Adicionar a nova mensagem do usuário
        if (needsFinancialData) {
            contents.push({
                role: "user",
                parts: [{ text: `${dataSummary}\n\n${userPrompt}` }]
            });
        } else {
            contents.push({
                role: "user",
                parts: [{ text: userPrompt }]
            });
        }

        const payload = {
            contents: contents,
            systemInstruction: systemInstruction,
            generationConfig: {
                maxOutputTokens: 150,
                temperature: 0.5
            }
        };

        try {
            console.log('Chamando Gemini API...');
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log('Status da resposta:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erro da API:', errorData);
                throw new Error(`API error: ${response.statusText} - ${JSON.stringify(errorData)}`);
            }

            const result = await response.json();
            console.log('Resposta do Gemini recebida');
            const modelResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível processar sua consulta.";

            await addDoc(chatHistoryCollectionRef, {
                role: 'model',
                content: modelResponse,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error('Erro Gemini completo:', error);
            let errorMessage = 'Desculpe, houve uma falha no processamento.';

            if (error.message.includes('API_KEY_INVALID')) {
                errorMessage = 'Erro: Chave da API Gemini inválida. Verifique suas configurações.';
            } else if (error.message.includes('PERMISSION_DENIED')) {
                errorMessage = 'Erro: Permissão negada. Verifique se a API do Gemini está habilitada no Google Cloud.';
            }

            await addDoc(chatHistoryCollectionRef, {
                role: 'model',
                content: errorMessage,
                timestamp: serverTimestamp()
            });
        } finally {
            if (aiLoading) aiLoading.classList.add('hidden');
        }
    }

    // Estatísticas por Categoria
    const statsMonthInput = document.getElementById('stats-month');
    const statsCategorySelect = document.getElementById('stats-category');
    const statsResultDiv = document.getElementById('stats-result');

    function updateStatsCategoryFilter() {
        if (!statsCategorySelect) return;

        // Obter lista única de categorias (nomes de transações)
        const categories = [...new Set(transactions.map(tx => tx.description))].sort();

        // Limpar e repopular o select
        statsCategorySelect.innerHTML = '<option value="">Todos os itens</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            statsCategorySelect.appendChild(option);
        });
    }

    function calculateStats() {
        if (!statsResultDiv) return;

        const selectedMonth = statsMonthInput.value; // formato: YYYY-MM
        const selectedCategory = statsCategorySelect.value;

        if (!selectedMonth) {
            statsResultDiv.innerHTML = '<p class="text-center italic text-sm">Selecione um período para ver as estatísticas</p>';
            return;
        }

        // Filtrar transações pelo mês selecionado
        const [year, month] = selectedMonth.split('-').map(Number);
        let filteredTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.date + 'T03:00:00Z');
            return txDate.getUTCFullYear() === year && txDate.getUTCMonth() === (month - 1);
        });

        // Se houver categoria selecionada, filtrar também
        if (selectedCategory) {
            filteredTransactions = filteredTransactions.filter(tx => tx.description === selectedCategory);
        }

        if (filteredTransactions.length === 0) {
            statsResultDiv.innerHTML = '<p class="text-center italic text-sm">Nenhuma transação encontrada para este período</p>';
            return;
        }

        // Agrupar por descrição
        const grouped = {};
        filteredTransactions.forEach(tx => {
            if (!grouped[tx.description]) {
                grouped[tx.description] = {
                    income: 0,
                    expense: 0,
                    count: 0
                };
            }
            if (tx.type === 'income') {
                grouped[tx.description].income += parseFloat(tx.amount);
            } else {
                grouped[tx.description].expense += parseFloat(tx.amount);
            }
            grouped[tx.description].count++;
        });

        // Renderizar estatísticas
        statsResultDiv.innerHTML = '';

        // Criar tabela de estatísticas
        const categories = Object.keys(grouped).sort();

        categories.forEach(category => {
            const data = grouped[category];
            const total = data.income - data.expense;
            const isPositive = total >= 0;

            const categoryCard = document.createElement('div');
            categoryCard.className = 'vintage-card p-4 border-l-4 ' + (isPositive ? 'border-olive' : 'border-rust');
            categoryCard.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg">${category}</h3>
                    <span class="text-sm font-mono">${data.count}x</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    ${data.income > 0 ? `<div><span class="text-olive">+R$ ${data.income.toFixed(2)}</span></div>` : '<div></div>'}
                    ${data.expense > 0 ? `<div><span class="text-rust">-R$ ${data.expense.toFixed(2)}</span></div>` : '<div></div>'}
                </div>
                <div class="mt-2 pt-2 border-t border-coffee border-dashed">
                    <span class="font-bold ${isPositive ? 'text-olive' : 'text-rust'}">
                        Total: ${isPositive ? '+' : ''}R$ ${total.toFixed(2)}
                    </span>
                </div>
            `;
            statsResultDiv.appendChild(categoryCard);
        });

        // Adicionar resumo geral
        const totalIncome = Object.values(grouped).reduce((sum, data) => sum + data.income, 0);
        const totalExpense = Object.values(grouped).reduce((sum, data) => sum + data.expense, 0);
        const totalCount = Object.values(grouped).reduce((sum, data) => sum + data.count, 0);
        const balance = totalIncome - totalExpense;

        const summaryCard = document.createElement('div');
        summaryCard.className = 'vintage-card p-4 bg-coffee text-cream mt-4';
        summaryCard.innerHTML = `
            <h3 class="font-bold text-center mb-3">RESUMO DO PERÍODO</h3>
            <div class="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <div class="text-xs opacity-75">Total de Lançamentos</div>
                    <div class="font-bold text-lg">${totalCount}</div>
                </div>
                <div>
                    <div class="text-xs opacity-75">Categorias</div>
                    <div class="font-bold text-lg">${categories.length}</div>
                </div>
                <div>
                    <div class="text-xs opacity-75">Entradas</div>
                    <div class="font-bold">+R$ ${totalIncome.toFixed(2)}</div>
                </div>
                <div>
                    <div class="text-xs opacity-75">Saídas</div>
                    <div class="font-bold">-R$ ${totalExpense.toFixed(2)}</div>
                </div>
            </div>
            <div class="mt-3 pt-3 border-t border-cream border-dashed text-center">
                <div class="text-xs opacity-75">Saldo do Período</div>
                <div class="font-bold text-xl">${balance >= 0 ? '+' : ''}R$ ${balance.toFixed(2)}</div>
            </div>
        `;
        statsResultDiv.appendChild(summaryCard);
    }

    // Event listeners para estatísticas
    if (statsMonthInput) {
        // Definir mês atual como padrão
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        statsMonthInput.value = currentMonth;

        statsMonthInput.addEventListener('change', calculateStats);
    }

    if (statsCategorySelect) {
        statsCategorySelect.addEventListener('change', calculateStats);
    }

    // Atualizar renderUI para incluir estatísticas
    const originalRenderUI = renderUI;
    renderUI = function() {
        renderTransactions();
        updateDashboard();
        updateProjection();
        updateStatsCategoryFilter();
        calculateStats();
    };

    // Verificar estado inicial
    console.log('App inicializado. Aguardando autenticação...');
    showLoading('Verificando credenciais...');
});