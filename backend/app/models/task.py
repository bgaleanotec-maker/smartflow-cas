from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import (
    String, Boolean, Integer, Date, DateTime, Float, ForeignKey,
    Text, func, Table, Column
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


# Task watchers association table
task_watchers_table = Table(
    "task_watchers",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # TSK-0001
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Markdown

    # Relations
    project_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("projects.id"), nullable=True
    )
    epic_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("epics.id"), nullable=True
    )
    sprint_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sprints.id"), nullable=True
    )
    assignee_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    reporter_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    status_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("task_statuses.id"), nullable=True
    )
    priority_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("priorities.id"), nullable=True
    )

    # Estimación
    story_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    estimated_hours: Mapped[float] = mapped_column(Float, default=0.0)
    logged_hours: Mapped[float] = mapped_column(Float, default=0.0)

    # Fechas
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # UI
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    labels: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # JSON
    attachments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Meta
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    project: Mapped[Optional["Project"]] = relationship("Project", back_populates="tasks")
    assignee: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assignee_id])
    reporter: Mapped[Optional["User"]] = relationship("User", foreign_keys=[reporter_id])
    status: Mapped[Optional["TaskStatus"]] = relationship("TaskStatus")
    priority: Mapped[Optional["Priority"]] = relationship("Priority")
    watchers: Mapped[List["User"]] = relationship(
        "User", secondary=task_watchers_table, lazy="select"
    )
    subtasks: Mapped[List["SubTask"]] = relationship("SubTask", back_populates="task")
    pomodoro_sessions: Mapped[List["PomodoroSession"]] = relationship(
        "PomodoroSession", back_populates="task"
    )


class SubTask(Base):
    __tablename__ = "subtasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id"), nullable=False)
    assignee_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    task: Mapped["Task"] = relationship("Task", back_populates="subtasks")
    assignee: Mapped[Optional["User"]] = relationship("User")
