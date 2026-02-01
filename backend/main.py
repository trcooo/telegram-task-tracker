from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from backend.database import Base, engine, SessionLocal
from backend.models import Task
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")  # <-- папка web внутри backend
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")

# CORS для Mini App
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # для теста
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Создаем таблицы
Base.metadata.create_all(bind=engine)



# ----------------- CRUD -----------------

@app.post("/tasks/")
def create_task(user_id: int, title: str, description: str = None, due_in_minutes: int = None):
    db: Session = SessionLocal()
    due_date = datetime.utcnow() + timedelta(minutes=due_in_minutes) if due_in_minutes else None
    task = Task(user_id=user_id, title=title, description=description, due_date=due_date)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@app.get("/tasks/{user_id}")
def get_tasks(user_id: int):
    db: Session = SessionLocal()
    return db.query(Task).filter(Task.user_id == user_id).all()

@app.post("/tasks/{task_id}/done")
def complete_task(task_id: int):
    db: Session = SessionLocal()
    task = db.query(Task).get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.completed = True
    db.commit()
    return {"status": "done"}

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    db: Session = SessionLocal()
    task = db.query(Task).get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"status": "deleted"}

@app.get("/tasks/due-soon/{user_id}")
def due_soon_tasks(user_id: int):
    db: Session = SessionLocal()
    now = datetime.utcnow()
    soon = now + timedelta(minutes=60)  # задачи, срок которых < 1 часа
    return db.query(Task).filter(Task.user_id == user_id, Task.due_date <= soon, Task.completed == False).all()
