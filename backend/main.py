from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend.database import Base, engine, SessionLocal
from backend.models import Task

app = FastAPI()

# Создаем таблицы в базе данных, если их ещё нет
Base.metadata.create_all(bind=engine)

# Подключаем статические файлы (frontend)
app.mount("/", StaticFiles(directory="web", html=True), name="web")


@app.get("/tasks/{user_id}")
def get_tasks(user_id: int):
    db = SessionLocal()
    tasks = db.query(Task).filter(Task.user_id == user_id).all()
    return tasks

@app.post("/tasks/")
def add_task(user_id: int, title: str):
    db = SessionLocal()
    task = Task(user_id=user_id, title=title)
    db.add(task)
    db.commit()
    return {"status": "ok"}

@app.post("/tasks/{task_id}/done")
def complete_task(task_id: int):
    db = SessionLocal()
    task = db.query(Task).get(task_id)
    task.completed = True
    db.commit()
    return {"status": "done"}
