from sqlalchemy import Column, Integer, String, Boolean
from backend.database import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    title = Column(String, nullable=False)
    completed = Column(Boolean, default=False)
