from datetime import datetime

from pydantic import BaseModel


class AppSettingOut(BaseModel):
    id: str
    key: str
    value: str | None
    group_name: str
    display_name: str
    description: str | None
    value_type: str
    is_sensitive: bool
    requires_restart: bool
    updated_by: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class AppSettingUpdate(BaseModel):
    value: str | None = None


class AppSettingBulkUpdate(BaseModel):
    settings: dict[str, str | None]  # key -> value


class AppSettingAuditOut(BaseModel):
    id: str
    setting_key: str | None = None
    old_value: str | None
    new_value: str | None
    changed_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
