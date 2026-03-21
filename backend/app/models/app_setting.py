import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AppSetting(Base):
    __tablename__ = "app_settings"
    __table_args__ = (
        sa.UniqueConstraint("key", name="uq_app_setting_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    group_name: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="string"
    )  # string, int, bool
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_restart: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    audit_logs = relationship(
        "AppSettingAuditLog", back_populates="setting", cascade="all, delete-orphan",
        order_by="AppSettingAuditLog.created_at.desc()", lazy="noload"
    )


class AppSettingAuditLog(Base):
    __tablename__ = "app_setting_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    setting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), sa.ForeignKey("app_settings.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    setting = relationship("AppSetting", back_populates="audit_logs")
