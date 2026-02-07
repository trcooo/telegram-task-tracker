const API_BASE = window.location.origin; // https://taskflowtrack.up.railway.app
let user_id = null;

// Initialize Telegram WebApp
function initTelegramWebApp() {
    if (window.Telegram && Telegram.WebApp) {
        const tg = Telegram.WebApp;

        // Expand to full screen
        tg.expand();

        // Set theme parameters
        tg.setHeaderColor('#4361ee');
        tg.setBackgroundColor('#f8f9fa');

        // Get user data
        const user = tg.initDataUnsafe?.user;
        if (user) {
            user_id = user.id;
            updateUserGreeting(user.first_name, user.last_name);

            // Send user info to backend (optional)
            sendUserInfo(user);
        }

        // Enable closing confirmation
        tg.enableClosingConfirmation();

        // Setup back button
        tg.BackButton.onClick(() => {
            tg.close();
        });

        return tg;
    }
    return null;
}

// Update greeting with user name
function updateUserGreeting(firstName, lastName) {
    const hour = new Date().getHours();
    let greeting = "Доброй ночи";
    if (hour >= 5 && hour < 12) greeting = "Доброе утро";
    else if (hour >= 12 && hour < 18) greeting = "Добрый день";
    else if (hour >= 18 && hour < 23) greeting = "Добрый вечер";

    const name = firstName || '';
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;

    document.getElementById('greeting-text').textContent = `${greeting}, ${name}!`;

    // Update user avatar if available
    const userAvatar = Telegram.WebApp.initDataUnsafe?.user?.photo_url;
    if (userAvatar) {
        document.querySelector('.user-avatar').innerHTML =
            `<img src="${userAvatar}" style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid white;">`;
    }
}

// Send user info to backend (for future features)
async function sendUserInfo(user) {
    try {
        await fetch(`${API_URL}/api/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                language_code: user.language_code
            })
        });
    } catch (error) {
        console.log('User info not sent:', error);
    }
}

// Fetch tasks from backend
async function fetchTasks() {
    if (!user_id) {
        user_id = 1; // Fallback for testing
    }

    try {
        const response = await fetch(`${API_URL}/tasks/${user_id}`);
        if (!response.ok) throw new Error('Failed to fetch tasks');

        const tasks = await response.json();
        return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }
}

// Render tasks
async function renderTasks() {
    const tasks = await fetchTasks();
    const container = document.getElementById('tasks-list');
    const emptyState = document.getElementById('empty-state');

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        container.appendChild(emptyState);
        updateStats(0, 0);
        return;
    }

    emptyState.style.display = 'none';

    // Sort tasks: active first, then by due date
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.due_date) - new Date(b.due_date);
    });

    container.innerHTML = '';

    sortedTasks.forEach(task => {
        const taskElement = createTaskElement(task);
        container.appendChild(taskElement);
    });

    const activeTasks = tasks.filter(t => !t.completed).length;
    updateStats(tasks.length, activeTasks);
}

// Create task element
function createTaskElement(task) {
    const div = document.createElement('div');
    div.className = `task-item ${task.completed ? 'completed' : ''}`;
    div.innerHTML = `
        <div class="task-header">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-actions">
                <button class="task-action-btn btn-complete" onclick="toggleTask(${task.id}, ${!task.completed})">
                    <i class="bi ${task.completed ? 'bi-arrow-counterclockwise' : 'bi-check-lg'}"></i>
                </button>
                <button class="task-action-btn btn-delete" onclick="deleteTask(${task.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
        ${task.description ? `<div style="font-size: 14px; color: var(--gray); margin: 8px 0;">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-datetime">
            ${task.due_date ? `
                <div class="datetime-text">
                    <i class="bi bi-calendar"></i>
                    <span>${formatDate(task.due_date)}</span>
                </div>
                <div class="datetime-text">
                    <i class="bi bi-clock"></i>
                    <span>${formatTime(task.due_date)}</span>
                </div>
            ` : ''}
            <div class="datetime-text" style="margin-left: auto; color: ${getPriorityColor(task.priority)}; font-weight: 600;">
                ${getPriorityText(task.priority)}
            </div>
        </div>
    `;
    return div;
}

// Add new task
async function addTask() {
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const date = document.getElementById('task-date').value;
    const time = document.getElementById('task-time').value;

    if (!title) {
        showNotification('Введите название задачи', 'warning');
        return;
    }

    if (!user_id) user_id = 1;

    try {
        const due_in_minutes = calculateDueMinutes(date, time);

        const response = await fetch(`${API_URL}/tasks/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: user_id,
                title: title,
                description: description,
                due_in_minutes: due_in_minutes
            })
        });

        if (response.ok) {
            // Clear form
            document.getElementById('task-title').value = '';
            document.getElementById('task-description').value = '';

            showNotification('Задача добавлена!', 'success');
            await renderTasks();

            // Close Mini App if in Telegram
            if (window.Telegram?.WebApp) {
                setTimeout(() => {
                    Telegram.WebApp.close();
                }, 1500);
            }
        } else {
            throw new Error('Failed to add task');
        }
    } catch (error) {
        console.error('Error adding task:', error);
        showNotification('Ошибка при добавлении задачи', 'error');
    }
}

// Toggle task completion
async function toggleTask(taskId, completed) {
    try {
        const endpoint = completed ? 'done' : 'undone';
        const response = await fetch(`${API_URL}/tasks/${taskId}/${endpoint}`, {
            method: 'POST'
        });

        if (response.ok) {
            await renderTasks();
            showNotification(completed ? 'Задача выполнена!' : 'Задача восстановлена', 'success');
        }
    } catch (error) {
        console.error('Error toggling task:', error);
    }
}

// Delete task
async function deleteTask(taskId) {
    if (!confirm('Удалить эту задачу?')) return;

    try {
        const response = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await renderTasks();
            showNotification('Задача удалена', 'info');
        }
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Сегодня';
    } else if (date.toDateString() === tomorrow.toDateString()) {
        return 'Завтра';
    } else {
        const options = { day: 'numeric', month: 'short' };
        return date.toLocaleDateString('ru-RU', options);
    }
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function calculateDueMinutes(date, time) {
    if (!date || !time) return null;

    const dueDate = new Date(`${date}T${time}`);
    const now = new Date();
    const diffMs = dueDate - now;

    return Math.max(0, Math.round(diffMs / (1000 * 60)));
}

function getPriorityColor(priority) {
    const colors = {
        high: '#ef4444',
        medium: '#f59e0b',
        low: '#10b981',
        none: '#6b7280'
    };
    return colors[priority] || colors.none;
}

function getPriorityText(priority) {
    const texts = {
        high: 'Высокий',
        medium: 'Средний',
        low: 'Низкий',
        none: 'Без приоритета'
    };
    return texts[priority] || texts.none;
}

function updateStats(total, active) {
    document.getElementById('total-tasks').textContent = total;
    document.getElementById('active-tasks').textContent = active;
    document.getElementById('completed-tasks').textContent = total - active;
    document.getElementById('task-count').textContent = `${active} активных из ${total}`;
}

// Show notification
function showNotification(message, type = 'info') {
    // Same notification function as in index.html
    // ...
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Telegram WebApp
    const tg = initTelegramWebApp();

    // Initialize form
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0,5);

    document.getElementById('task-date').value = today;
    document.getElementById('task-date').min = today;
    document.getElementById('task-time').value = time;

    // Setup event listeners
    document.getElementById('add-task').addEventListener('click', addTask);

    // Allow Enter key to add task
    document.getElementById('task-title').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addTask();
        }
    });

    // Load tasks
    renderTasks();

    // Setup bottom navigation
    setupNavigation();
});

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();

            // Remove active class from all
            document.querySelectorAll('.nav-item').forEach(nav => {
                nav.classList.remove('active');
            });

            // Add active to clicked
            this.classList.add('active');

            // Handle navigation (simplified)
            const section = this.querySelector('span').textContent.toLowerCase();
            showNotification(`Раздел "${section}" в разработке`, 'info');
        });
    });
}
// app/web/app.js
const API_URL = window.location.origin;

// Функции для работы с API
class TaskAPI {
    static async getTasks(userId) {
        try {
            const response = await fetch(`${API_URL}/api/tasks/${userId}`);
            if (!response.ok) throw new Error('Failed to fetch tasks');
            return await response.json();
        } catch (error) {
            console.error('Error fetching tasks:', error);
            return [];
        }
    }

    static async createTask(taskData) {
        try {
            const response = await fetch(`${API_URL}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error creating task:', error);
            throw error;
        }
    }

    static async updateTask(taskId, taskData) {
        try {
            const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
            return await response.json();
        } catch (error) {
            console.error('Error updating task:', error);
            throw error;
        }
    }

    static async deleteTask(taskId) {
        try {
            const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
                method: 'DELETE'
            });
            return await response.json();
        } catch (error) {
            console.error('Error deleting task:', error);
            throw error;
        }
    }

    static async toggleComplete(taskId, completed) {
        try {
            const endpoint = completed ? 'done' : 'undone';
            const response = await fetch(`${API_URL}/api/tasks/${taskId}/${endpoint}`, {
                method: 'POST'
            });
            return await response.json();
        } catch (error) {
            console.error('Error toggling task:', error);
            throw error;
        }
    }
}

// Интеграция с основным скриптом
function initAPIIntegration() {
    // Заменяем функции сохранения на API вызовы
    const originalSaveTasks = window.saveTasks;

    window.saveTasks = async function() {
        const tg = window.Telegram?.WebApp;
        const userId = tg?.initDataUnsafe?.user?.id || 1;

        try {
            // Сохраняем в localStorage для оффлайн работы
            localStorage.setItem('tasks', JSON.stringify(window.tasks));

            // Синхронизируем с сервером
            if (window.tasks.length > 0) {
                // Здесь можно добавить логику синхронизации с сервером
                // Например, отправлять каждую задачу через API
                console.log('Tasks saved locally, ready for sync');
            }

            updateStats();
            renderTasks();

        } catch (error) {
            console.error('Error saving tasks:', error);
        }
    };

    // Функция синхронизации с сервером
    window.syncWithServer = async function() {
        const tg = window.Telegram?.WebApp;
        const userId = tg?.initDataUnsafe?.user?.id;

        if (!userId) {
            console.log('No user ID for sync');
            return;
        }

        try {
            // Получаем задачи с сервера
            const serverTasks = await TaskAPI.getTasks(userId);

            // Получаем локальные задачи
            const localTasks = JSON.parse(localStorage.getItem('tasks') || '[]');

            // Здесь можно добавить логику синхронизации
            // Например, объединение, разрешение конфликтов

            console.log('Sync completed:', { serverTasks, localTasks });

            return serverTasks;
        } catch (error) {
            console.error('Sync error:', error);
            return [];
        }
    };
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Добавляем интеграцию с API
    initAPIIntegration();

    // Пытаемся синхронизировать при загрузке
    setTimeout(() => {
        window.syncWithServer().then(serverTasks => {
            if (serverTasks.length > 0) {
                console.log('Synced with server:', serverTasks.length, 'tasks');
            }
        });
    }, 2000);
});