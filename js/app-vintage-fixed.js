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
import { FutureTransactionsManager } from './future-transactions.js';

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
let futureTransactionsManager = null;

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

            // Inicializar gerenciador de transações futuras
            if (futureTransactionsManager) {
                futureTransactionsManager.cleanup();
            }
            futureTransactionsManager = new FutureTransactionsManager(db, userId);

            // Configurar listeners do Firestore
            setupFirestoreListeners();

            // Esconder loading
            hideLoading();

        } else {
            // Usuário não está logado
            console.log('Usuário deslogado, mostrando tela de login');

            // Limpar gerenciador de transações futuras
            if (futureTransactionsManager) {
                futureTransactionsManager.cleanup();
                futureTransactionsManager = null;
            }

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
    const projectionStartDateInput = document.getElementById('projection-start-date');
    const projectionEndDateInput = document.getElementById('projection-end-date');
    const projectionResultEl = document.getElementById('projection-result');

    // Configurar data padrão
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Configurar datas padrão da projeção
    if (projectionStartDateInput && projectionEndDateInput) {
        const today = new Date();
        projectionStartDateInput.value = today.toISOString().split('T')[0];

        const futureDate = new Date(today);
        futureDate.setMonth(futureDate.getMonth() + 1);
        projectionEndDateInput.value = futureDate.toISOString().split('T')[0];
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

        const today = new Date().toISOString().split('T')[0];
        let todayElement = null;
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

                // Marcar elemento do dia atual
                if (tx.date === today) {
                    dateHeader.id = 'today-marker';
                    todayElement = dateHeader;
                }

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

        // Scroll automático para o dia atual
        setTimeout(() => {
            if (todayElement) {
                todayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
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
        if (!projectionStartDateInput || !projectionEndDateInput || !projectionResultEl) return;

        const startDateStr = projectionStartDateInput.value;
        const endDateStr = projectionEndDateInput.value;

        if (!startDateStr || !endDateStr) {
            projectionResultEl.innerHTML = `<p class="text-sm italic">Selecione o período</p>`;
            return;
        }

        const startDate = new Date(startDateStr + 'T00:00:00');
        const endDate = new Date(endDateStr + 'T23:59:59');

        // Calcular saldo inicial (até a data de início)
        let initialBalance = 0;
        transactions.forEach(tx => {
            const txDate = new Date(tx.date + 'T00:00:00');
            if (txDate < startDate) {
                initialBalance += tx.type === 'income' ? parseFloat(tx.amount) : -parseFloat(tx.amount);
            }
        });

        // Calcular projeção até data final (transações confirmadas)
        let projectedBalance = initialBalance;
        transactions.forEach(tx => {
            const txDate = new Date(tx.date + 'T00:00:00');
            if (txDate >= startDate && txDate <= endDate) {
                projectedBalance += tx.type === 'income' ? parseFloat(tx.amount) : -parseFloat(tx.amount);
            }
        });

        // Incluir contas e entradas futuras na projeção
        if (futureTransactionsManager) {
            // Adicionar contas futuras (despesas)
            futureTransactionsManager.futureExpenses.forEach(expense => {
                const expenseDate = new Date(expense.date + 'T00:00:00');
                if (expenseDate >= startDate && expenseDate <= endDate) {
                    projectedBalance -= parseFloat(expense.amount);
                }
            });

            // Adicionar entradas futuras (receitas)
            futureTransactionsManager.futureIncomes.forEach(income => {
                const incomeDate = new Date(income.date + 'T00:00:00');
                if (incomeDate >= startDate && incomeDate <= endDate) {
                    projectedBalance += parseFloat(income.amount);
                }
            });
        }

        const periodChange = projectedBalance - initialBalance;

        // Contar contas futuras incluídas na projeção
        let futureExpensesCount = 0;
        let futureIncomesCount = 0;
        if (futureTransactionsManager) {
            futureTransactionsManager.futureExpenses.forEach(expense => {
                const expenseDate = new Date(expense.date + 'T00:00:00');
                if (expenseDate >= startDate && expenseDate <= endDate) {
                    futureExpensesCount++;
                }
            });
            futureTransactionsManager.futureIncomes.forEach(income => {
                const incomeDate = new Date(income.date + 'T00:00:00');
                if (incomeDate >= startDate && incomeDate <= endDate) {
                    futureIncomesCount++;
                }
            });
        }

        projectionResultEl.innerHTML = `
            <div class="text-center">
                <div class="text-xs mb-1">Saldo projetado no período:</div>
                <div class="stamp ${projectedBalance >= 0 ? 'income' : 'expense'}">
                    R$ ${projectedBalance.toFixed(2)}
                </div>
                <div class="text-xs mt-2">
                    Variação: <span class="${periodChange >= 0 ? 'text-olive' : 'text-rust'} font-bold">
                        ${periodChange >= 0 ? '+' : ''}R$ ${periodChange.toFixed(2)}
                    </span>
                </div>
                ${(futureExpensesCount > 0 || futureIncomesCount > 0) ? `
                    <div class="text-xs mt-2 italic" style="color: var(--coffee);">
                        Incluindo:
                        ${futureExpensesCount > 0 ? `${futureExpensesCount} conta(s) a pagar` : ''}
                        ${futureExpensesCount > 0 && futureIncomesCount > 0 ? ' e ' : ''}
                        ${futureIncomesCount > 0 ? `${futureIncomesCount} entrada(s) futura(s)` : ''}
                    </div>
                ` : ''}
            </div>`;
    }

    // Event listeners para projeção
    if (projectionStartDateInput) {
        projectionStartDateInput.addEventListener('change', () => {
            updateProjection();
            const showChartBtn = document.getElementById('show-chart-btn');
            if (showChartBtn && projectionStartDateInput.value && projectionEndDateInput.value) {
                showChartBtn.classList.remove('hidden');
            }
        });
    }

    if (projectionEndDateInput) {
        projectionEndDateInput.addEventListener('change', () => {
            updateProjection();
            const showChartBtn = document.getElementById('show-chart-btn');
            if (showChartBtn && projectionStartDateInput.value && projectionEndDateInput.value) {
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
        if (!projectionStartDateInput.value || !projectionEndDateInput.value || !balanceChartCanvas) return;

        const startDate = new Date(projectionStartDateInput.value + 'T00:00:00');
        const endDate = new Date(projectionEndDateInput.value + 'T23:59:59');

        // Criar array de datas do início ao fim
        const dates = [];
        const balances = [];

        // Ordenar transações por data
        const sortedTx = [...transactions].sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
        });

        // Calcular saldo inicial (antes da data de início)
        let runningBalance = 0;
        sortedTx.forEach(tx => {
            const txDate = new Date(tx.date + 'T00:00:00');
            if (txDate < startDate) {
                const amount = parseFloat(tx.amount);
                runningBalance += tx.type === 'income' ? amount : -amount;
            }
        });

        // Adicionar ponto inicial
        let currentDate = new Date(startDate);
        dates.push(currentDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' }));
        balances.push(runningBalance);

        // Calcular projeção dia a dia
        currentDate.setDate(currentDate.getDate() + 1);

        while (currentDate <= endDate) {
            // Verificar se há transações confirmadas neste dia
            sortedTx.forEach(tx => {
                const txDate = new Date(tx.date + 'T00:00:00');
                if (txDate.toDateString() === currentDate.toDateString()) {
                    const amount = parseFloat(tx.amount);
                    runningBalance += tx.type === 'income' ? amount : -amount;
                }
            });

            // Verificar se há contas futuras neste dia
            if (futureTransactionsManager) {
                // Contas a pagar
                futureTransactionsManager.futureExpenses.forEach(expense => {
                    const expenseDate = new Date(expense.date + 'T00:00:00');
                    if (expenseDate.toDateString() === currentDate.toDateString()) {
                        runningBalance -= parseFloat(expense.amount);
                    }
                });

                // Entradas futuras
                futureTransactionsManager.futureIncomes.forEach(income => {
                    const incomeDate = new Date(income.date + 'T00:00:00');
                    if (incomeDate.toDateString() === currentDate.toDateString()) {
                        runningBalance += parseFloat(income.amount);
                    }
                });
            }

            dates.push(currentDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' }));
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

    // Estatísticas por Categoria - Nova implementação melhorada
    const statsMonthInput = document.getElementById('stats-month');
    const statsCategorySelect = document.getElementById('stats-category');
    const statsResultDiv = document.getElementById('stats-result');

    // Tabs de estatísticas
    const statsOverviewTab = document.getElementById('stats-overview-tab');
    const statsRankingTab = document.getElementById('stats-ranking-tab');
    const statsChartTab = document.getElementById('stats-chart-tab');

    // Painéis
    const statsOverviewPanel = document.getElementById('stats-overview');
    const statsRankingPanel = document.getElementById('stats-ranking');
    const statsChartPanel = document.getElementById('stats-chart');

    let categoryChart = null; // Para o gráfico de categorias

    // Configurar tabs de estatísticas
    function setupStatsTabs() {
        if (statsOverviewTab) {
            statsOverviewTab.addEventListener('click', () => {
                showStatsPanel('overview');
            });
        }

        if (statsRankingTab) {
            statsRankingTab.addEventListener('click', () => {
                showStatsPanel('ranking');
            });
        }

        if (statsChartTab) {
            statsChartTab.addEventListener('click', () => {
                showStatsPanel('chart');
            });
        }
    }

    function showStatsPanel(panel) {
        // Atualizar tabs
        document.querySelectorAll('#stats-overview-tab, #stats-ranking-tab, #stats-chart-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Esconder todos os painéis
        document.querySelectorAll('.stats-panel').forEach(p => {
            p.classList.add('hidden');
        });

        // Mostrar painel selecionado
        switch(panel) {
            case 'overview':
                statsOverviewTab.classList.add('active');
                statsOverviewPanel.classList.remove('hidden');
                break;
            case 'ranking':
                statsRankingTab.classList.add('active');
                statsRankingPanel.classList.remove('hidden');
                break;
            case 'chart':
                statsChartTab.classList.add('active');
                statsChartPanel.classList.remove('hidden');
                if (statsMonthInput.value) {
                    renderCategoryChart();
                }
                break;
        }
    }

    setupStatsTabs();

    function updateStatsCategoryFilter() {
        if (!statsCategorySelect) return;

        // Obter lista única de categorias (nomes de transações)
        const categories = [...new Set(transactions.map(tx => tx.description))].sort();

        // Limpar e repopular o select
        statsCategorySelect.innerHTML = '<option value="">Todas as categorias</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            statsCategorySelect.appendChild(option);
        });
    }

    function calculateStats() {
        const selectedMonth = statsMonthInput.value; // formato: YYYY-MM
        const selectedCategory = statsCategorySelect.value;

        if (!selectedMonth) {
            statsOverviewPanel.innerHTML = '<p class="text-center italic text-sm">Selecione um período para ver as estatísticas</p>';
            statsRankingPanel.innerHTML = '';
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
            statsOverviewPanel.innerHTML = '<p class="text-center italic text-sm">Nenhuma transação encontrada para este período</p>';
            statsRankingPanel.innerHTML = '';
            return;
        }

        // Agrupar por descrição
        const grouped = {};
        filteredTransactions.forEach(tx => {
            if (!grouped[tx.description]) {
                grouped[tx.description] = {
                    income: 0,
                    expense: 0,
                    count: 0,
                    dates: []
                };
            }
            if (tx.type === 'income') {
                grouped[tx.description].income += parseFloat(tx.amount);
            } else {
                grouped[tx.description].expense += parseFloat(tx.amount);
            }
            grouped[tx.description].count++;
            grouped[tx.description].dates.push(tx.date);
        });

        // Calcular totais
        const totalIncome = Object.values(grouped).reduce((sum, data) => sum + data.income, 0);
        const totalExpense = Object.values(grouped).reduce((sum, data) => sum + data.expense, 0);
        const balance = totalIncome - totalExpense;

        // Renderizar Visão Geral
        renderOverview(grouped, totalIncome, totalExpense, balance, selectedCategory);

        // Renderizar Rankings
        renderRankings(grouped, totalExpense);

        // Se a aba de gráfico estiver ativa, renderizar
        if (!statsChartPanel.classList.contains('hidden')) {
            renderCategoryChart();
        }
    }

    function renderOverview(grouped, totalIncome, totalExpense, balance, selectedCategory) {
        statsOverviewPanel.innerHTML = '';

        // Cards de resumo
        const summaryHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div class="stat-card">
                    <div class="text-xs opacity-75 mb-1">Total Entradas</div>
                    <div class="text-lg font-bold text-green-700">+R$ ${totalIncome.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <div class="text-xs opacity-75 mb-1">Total Saídas</div>
                    <div class="text-lg font-bold text-red-700">-R$ ${totalExpense.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <div class="text-xs opacity-75 mb-1">Saldo Período</div>
                    <div class="text-lg font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}">
                        ${balance >= 0 ? '+' : ''}R$ ${balance.toFixed(2)}
                    </div>
                </div>
                <div class="stat-card">
                    <div class="text-xs opacity-75 mb-1">Transações</div>
                    <div class="text-lg font-bold">${Object.values(grouped).reduce((sum, d) => sum + d.count, 0)}</div>
                </div>
            </div>
        `;

        statsOverviewPanel.innerHTML = summaryHTML;

        // Categorias com barras de progresso
        const categories = Object.entries(grouped)
            .map(([name, data]) => ({
                name,
                ...data,
                total: data.expense || data.income,
                net: data.income - data.expense
            }))
            .sort((a, b) => b.total - a.total);

        const maxValue = Math.max(...categories.map(c => c.total));

        const categoriesContainer = document.createElement('div');
        categoriesContainer.className = 'space-y-4';

        categories.forEach(cat => {
            const percentage = (cat.total / maxValue) * 100;
            const isExpense = cat.expense > cat.income;

            const categoryHTML = `
                <div class="vintage-card p-4">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="font-bold">${cat.name}</h3>
                            <div class="text-xs text-gray-600">${cat.count} transação(ões)</div>
                        </div>
                        <div class="text-right">
                            <div class="font-bold ${isExpense ? 'text-red-700' : 'text-green-700'}">
                                R$ ${cat.total.toFixed(2)}
                            </div>
                            <span class="percentage-badge">${((cat.total / (isExpense ? totalExpense : totalIncome)) * 100).toFixed(1)}%</span>
                        </div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${isExpense ? 'expense' : ''}" style="width: ${percentage}%"></div>
                    </div>
                    ${cat.income > 0 && cat.expense > 0 ? `
                        <div class="grid grid-cols-2 gap-2 mt-2 text-xs">
                            <div>Entradas: <span class="text-green-700">+R$ ${cat.income.toFixed(2)}</span></div>
                            <div>Saídas: <span class="text-red-700">-R$ ${cat.expense.toFixed(2)}</span></div>
                        </div>
                    ` : ''}
                </div>
            `;

            const div = document.createElement('div');
            div.innerHTML = categoryHTML;
            categoriesContainer.appendChild(div.firstElementChild);
        });

        statsOverviewPanel.appendChild(categoriesContainer);
    }

    function renderRankings(grouped, totalExpense) {
        statsRankingPanel.innerHTML = '';

        // Top gastos
        const expenses = Object.entries(grouped)
            .filter(([_, data]) => data.expense > 0)
            .map(([name, data]) => ({ name, amount: data.expense, count: data.count }))
            .sort((a, b) => b.amount - a.amount);

        // Top entradas
        const incomes = Object.entries(grouped)
            .filter(([_, data]) => data.income > 0)
            .map(([name, data]) => ({ name, amount: data.income, count: data.count }))
            .sort((a, b) => b.amount - a.amount);

        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';

        // Ranking de Gastos
        html += '<div><h3 class="font-bold text-lg mb-4 text-red-700">🏆 Top Gastos</h3>';
        expenses.slice(0, 5).forEach((item, index) => {
            const medalClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            html += `
                <div class="ranking-item">
                    <div class="ranking-medal ${medalClass}">${index + 1}º</div>
                    <div class="flex-grow">
                        <div class="font-bold">${item.name}</div>
                        <div class="text-xs text-gray-600">${item.count} vez(es)</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-red-700">R$ ${item.amount.toFixed(2)}</div>
                        <div class="text-xs">${((item.amount / totalExpense) * 100).toFixed(1)}%</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        // Ranking de Entradas
        html += '<div><h3 class="font-bold text-lg mb-4 text-green-700">💰 Top Entradas</h3>';
        incomes.slice(0, 5).forEach((item, index) => {
            const medalClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            html += `
                <div class="ranking-item">
                    <div class="ranking-medal ${medalClass}">${index + 1}º</div>
                    <div class="flex-grow">
                        <div class="font-bold">${item.name}</div>
                        <div class="text-xs text-gray-600">${item.count} vez(es)</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-green-700">R$ ${item.amount.toFixed(2)}</div>
                    </div>
                </div>
            `;
        });
        html += '</div></div>';

        statsRankingPanel.innerHTML = html;
    }

    function renderCategoryChart() {
        const canvas = document.getElementById('category-chart');
        if (!canvas || !statsMonthInput.value) return;

        // Filtrar transações
        const [year, month] = statsMonthInput.value.split('-').map(Number);
        let filteredTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.date + 'T03:00:00Z');
            return txDate.getUTCFullYear() === year && txDate.getUTCMonth() === (month - 1);
        });

        if (statsCategorySelect.value) {
            filteredTransactions = filteredTransactions.filter(tx => tx.description === statsCategorySelect.value);
        }

        // Agrupar dados
        const grouped = {};
        filteredTransactions.forEach(tx => {
            if (!grouped[tx.description]) {
                grouped[tx.description] = { income: 0, expense: 0 };
            }
            if (tx.type === 'income') {
                grouped[tx.description].income += parseFloat(tx.amount);
            } else {
                grouped[tx.description].expense += parseFloat(tx.amount);
            }
        });

        // Preparar dados para o gráfico
        const labels = Object.keys(grouped);
        const expenseData = labels.map(l => grouped[l].expense);
        const incomeData = labels.map(l => grouped[l].income);

        // Destruir gráfico anterior
        if (categoryChart) {
            categoryChart.destroy();
        }

        // Criar novo gráfico
        const ctx = canvas.getContext('2d');
        categoryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Saídas',
                        data: expenseData,
                        backgroundColor: 'rgba(205, 92, 92, 0.7)',
                        borderColor: '#CD5C5C',
                        borderWidth: 2
                    },
                    {
                        label: 'Entradas',
                        data: incomeData,
                        backgroundColor: 'rgba(85, 107, 47, 0.7)',
                        borderColor: '#556B2F',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                family: "'Courier Prime', monospace"
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': R$ ' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toFixed(0);
                            },
                            font: {
                                family: "'Courier Prime', monospace"
                            }
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
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
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

    // Expor updateProjection globalmente para ser chamada pelo módulo de contas futuras
    window.updateProjection = updateProjection;

    // Verificar estado inicial
    console.log('App inicializado. Aguardando autenticação...');
    showLoading('Verificando credenciais...');
});