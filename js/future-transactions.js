// Módulo de Contas e Entradas Futuras
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
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class FutureTransactionsManager {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.futureExpenses = [];
        this.futureIncomes = [];
        this.futureExpensesRef = null;
        this.futureIncomesRef = null;
        this.unsubscribeExpenses = null;
        this.unsubscribeIncomes = null;

        this.initializeCollections();
        this.initializeEventListeners();
        this.loadFutureTransactions();
    }

    initializeCollections() {
        if (this.userId) {
            this.futureExpensesRef = collection(this.db, `users/${this.userId}/futureExpenses`);
            this.futureIncomesRef = collection(this.db, `users/${this.userId}/futureIncomes`);
        }
    }

    initializeEventListeners() {
        // Botões para adicionar
        const addExpenseBtn = document.getElementById('add-future-expense-btn');
        const addIncomeBtn = document.getElementById('add-future-income-btn');

        // Modal elements
        const modal = document.getElementById('future-modal');
        const modalTitle = document.getElementById('future-modal-title');
        const form = document.getElementById('future-transaction-form');
        const cancelBtn = document.getElementById('cancel-future-btn');
        const typeInput = document.getElementById('future-type');

        if (addExpenseBtn) {
            addExpenseBtn.addEventListener('click', () => {
                modalTitle.textContent = 'Adicionar Conta a Pagar';
                typeInput.value = 'expense';
                modal.classList.remove('hidden');
                // Set minimum date to today
                document.getElementById('future-date').min = new Date().toISOString().split('T')[0];
            });
        }

        if (addIncomeBtn) {
            addIncomeBtn.addEventListener('click', () => {
                modalTitle.textContent = 'Adicionar Entrada Futura';
                typeInput.value = 'income';
                modal.classList.remove('hidden');
                // Set minimum date to today
                document.getElementById('future-date').min = new Date().toISOString().split('T')[0];
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
                form.reset();
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.addFutureTransaction();
            });
        }
    }

    async addFutureTransaction() {
        const description = document.getElementById('future-description').value;
        const amount = parseFloat(document.getElementById('future-amount').value);
        const date = document.getElementById('future-date').value;
        const type = document.getElementById('future-type').value;

        const transaction = {
            description,
            amount,
            date,
            status: 'pending',
            createdAt: serverTimestamp(),
            userId: this.userId
        };

        try {
            const collectionRef = type === 'expense' ? this.futureExpensesRef : this.futureIncomesRef;
            await addDoc(collectionRef, transaction);

            // Close modal and reset form
            document.getElementById('future-modal').classList.add('hidden');
            document.getElementById('future-transaction-form').reset();

            console.log(`${type} futura adicionada com sucesso`);
        } catch (error) {
            console.error(`Erro ao adicionar ${type} futura:`, error);
            alert(`Erro ao adicionar ${type === 'expense' ? 'conta' : 'entrada'} futura`);
        }
    }

    loadFutureTransactions() {
        // Load future expenses
        if (this.futureExpensesRef) {
            const expensesQuery = query(this.futureExpensesRef, orderBy('date', 'asc'));
            this.unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
                this.futureExpenses = [];
                snapshot.forEach((doc) => {
                    this.futureExpenses.push({ id: doc.id, ...doc.data() });
                });
                this.renderFutureExpenses();
            });
        }

        // Load future incomes
        if (this.futureIncomesRef) {
            const incomesQuery = query(this.futureIncomesRef, orderBy('date', 'asc'));
            this.unsubscribeIncomes = onSnapshot(incomesQuery, (snapshot) => {
                this.futureIncomes = [];
                snapshot.forEach((doc) => {
                    this.futureIncomes.push({ id: doc.id, ...doc.data() });
                });
                this.renderFutureIncomes();
            });
        }
    }

    renderFutureExpenses() {
        const listEl = document.getElementById('future-expenses-list');
        if (!listEl) return;

        if (this.futureExpenses.length === 0) {
            listEl.innerHTML = '<p class="text-center italic text-sm">Nenhuma conta futura</p>';
            return;
        }

        listEl.innerHTML = '';
        const today = new Date().toISOString().split('T')[0];

        this.futureExpenses.forEach(expense => {
            const itemDiv = this.createFutureItemElement(expense, 'expense', today);
            listEl.appendChild(itemDiv);
        });
    }

    renderFutureIncomes() {
        const listEl = document.getElementById('future-incomes-list');
        if (!listEl) return;

        if (this.futureIncomes.length === 0) {
            listEl.innerHTML = '<p class="text-center italic text-sm">Nenhuma entrada futura</p>';
            return;
        }

        listEl.innerHTML = '';
        const today = new Date().toISOString().split('T')[0];

        this.futureIncomes.forEach(income => {
            const itemDiv = this.createFutureItemElement(income, 'income', today);
            listEl.appendChild(itemDiv);
        });
    }

    createFutureItemElement(item, type, today) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'future-item';

        // Check if overdue, today, or future
        if (item.date < today) {
            itemDiv.classList.add('overdue');
        } else if (item.date === today) {
            itemDiv.classList.add('today');
        }

        const dateObj = new Date(item.date + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('pt-BR');

        // Calculate days difference
        const todayDate = new Date(today);
        const diffTime = dateObj - todayDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let statusText = '';
        if (diffDays < 0) {
            statusText = `<span class="text-red-600 font-bold">${Math.abs(diffDays)} dia(s) atrasado</span>`;
        } else if (diffDays === 0) {
            statusText = '<span class="text-yellow-600 font-bold">Vence hoje!</span>';
        } else if (diffDays <= 3) {
            statusText = `<span class="text-orange-600">Em ${diffDays} dia(s)</span>`;
        } else {
            statusText = `Em ${diffDays} dias`;
        }

        itemDiv.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex-grow">
                    <div class="font-bold text-sm">${item.description}</div>
                    <div class="text-xs future-date">
                        ${formattedDate} - ${statusText}
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold ${type === 'expense' ? 'text-red-600' : 'text-green-600'}">
                        R$ ${item.amount.toFixed(2)}
                    </div>
                </div>
            </div>
            <div class="flex gap-2 justify-end">
                <button class="confirm-btn" data-id="${item.id}" data-type="${type}">
                    ${type === 'expense' ? 'Pagar' : 'Confirmar'}
                </button>
                <button class="delete-future-btn" data-id="${item.id}" data-type="${type}">
                    Excluir
                </button>
            </div>
        `;

        // Add event listeners
        const confirmBtn = itemDiv.querySelector('.confirm-btn');
        const deleteBtn = itemDiv.querySelector('.delete-future-btn');

        confirmBtn.addEventListener('click', () => this.confirmTransaction(item, type));
        deleteBtn.addEventListener('click', () => this.deleteFutureTransaction(item.id, type));

        return itemDiv;
    }

    async confirmTransaction(item, type) {
        try {
            // Add to main transactions (we'll need to get the main transactions collection reference)
            const mainTransactionsRef = collection(this.db, `users/${this.userId}/transactions`);

            const transaction = {
                description: item.description,
                amount: item.amount,
                date: new Date().toISOString().split('T')[0], // Use today's date for confirmation
                type: type === 'expense' ? 'expense' : 'income',
                createdAt: serverTimestamp(),
                userId: this.userId,
                originalDueDate: item.date, // Keep original due date for reference
                confirmedFromFuture: true
            };

            await addDoc(mainTransactionsRef, transaction);

            // Remove from future transactions
            await this.deleteFutureTransaction(item.id, type);

            console.log(`${type} confirmada e movida para o histórico`);
        } catch (error) {
            console.error(`Erro ao confirmar ${type}:`, error);
            alert(`Erro ao confirmar ${type === 'expense' ? 'pagamento' : 'recebimento'}`);
        }
    }

    async deleteFutureTransaction(id, type) {
        try {
            const collectionRef = type === 'expense' ? this.futureExpensesRef : this.futureIncomesRef;
            await deleteDoc(doc(collectionRef, id));
            console.log(`${type} futura removida`);
        } catch (error) {
            console.error(`Erro ao remover ${type} futura:`, error);
            alert(`Erro ao remover ${type === 'expense' ? 'conta' : 'entrada'} futura`);
        }
    }

    cleanup() {
        if (this.unsubscribeExpenses) {
            this.unsubscribeExpenses();
        }
        if (this.unsubscribeIncomes) {
            this.unsubscribeIncomes();
        }
    }
}