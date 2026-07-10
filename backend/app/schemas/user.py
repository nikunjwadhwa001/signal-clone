from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_url: str | None = None
    about: str = ""
    last_seen_at: datetime | None = None


class UserMe(UserPublic):
    phone: str | None = None
    safety_number: str = ""


class UpdateMeRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=128)
    avatar_url: str | None = Field(default=None, max_length=512)
    about: str | None = Field(default=None, max_length=256)
