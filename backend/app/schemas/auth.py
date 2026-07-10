from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    phone: str | None = Field(default=None, max_length=32)
    display_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=6, max_length=128)


class RegisterResponse(BaseModel):
    username: str
    # In this mock the OTP is fixed; returned so the UI can prefill it.
    otp_hint: str


class VerifyRequest(BaseModel):
    username: str
    otp: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class WsTicketResponse(BaseModel):
    ticket: str
