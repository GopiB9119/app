from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class LiveConnectionLease(Base):
    __tablename__ = "live_connection_leases"
    __table_args__ = (
        Index("ix_live_connection_account_expiry", "account_id", "expires_at"),
        Index("ix_live_connection_expiry", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))