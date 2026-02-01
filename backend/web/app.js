const API_URL = "https://telegram-task-tracker-production.up.railway.app";

const user_id = 1; // для теста, можно брать через Telegram WebApp API

async function fetchTasks() {
  const res = await fetch(`${API_URL}/tasks/${user_id}`);
  const tasks = await res.json();
  const container = document.getElementById("task-list");
  container.innerHTML = "";
  tasks.forEach(task => {
    const div = document.createElement("div");
    div.className = "task-card";
    div.innerHTML = `<b>${task.title}</b> - ${task.description || ""} ${task.completed ? "✅" : ""}`;
    container.appendChild(div);
  });
}

document.getElementById("add-task").addEventListener("click", async () => {
  const title = document.getElementById("title").value;
  const description = document.getElementById("description").value;
  const due_in_minutes = parseInt(document.getElementById("due").value) || null;
  await fetch(`${API_URL}/tasks/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, title, description, due_in_minutes })
  });
  fetchTasks();
});

fetchTasks();
