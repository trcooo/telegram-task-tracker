const tg = window.Telegram.WebApp;
tg.expand();

const userId = tg.initDataUnsafe.user.id;
const API = "https://telegram-task-tracker.up.railway.app";

function loadTasks() {
    fetch(`${API}/tasks/${userId}`)
        .then(r => r.json())
        .then(tasks => {
            const list = document.getElementById("taskList");
            list.innerHTML = "";

            tasks.forEach(task => {
                const li = document.createElement("li");

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = task.completed;

                checkbox.onchange = () => {
                    fetch(`${API}/tasks/${task.id}/done`, { method: "POST" });
                };

                const text = document.createElement("span");
                text.innerText = task.title;
                if (task.completed) {
                    text.style.textDecoration = "line-through";
                    text.style.opacity = "0.5";
                }

                li.appendChild(checkbox);
                li.appendChild(text);
                list.appendChild(li);
            });
        });
}

function addTask() {
    const input = document.getElementById("taskInput");
    if (!input.value) return;

    fetch(`${API}/tasks/?user_id=${userId}&title=${input.value}`, {
        method: "POST"
    }).then(() => {
        input.value = "";
        loadTasks();
    });
}

loadTasks();
