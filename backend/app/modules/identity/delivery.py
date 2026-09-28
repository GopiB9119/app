import json
import smtplib
from datetime import timedelta
from email.message import EmailMessage
from uuid import uuid4

from sqlalchemy import delete, select, update

from app.modules.identity.models import Challenge, IdentityMail, RateBucket


class LocalSmtp:
    def __init__(self, settings):
        self.settings = settings

    def __call__(self, payload):
        message = EmailMessage()
        message["From"] = "Community Platform <no-reply@community.test>"
        message["To"] = payload["email"]
        message["Subject"] = f"Community Platform: {payload['purpose']} code"
        message["Message-ID"] = f"<{payload['challenge_id']}@community.test>"
        message.set_content(
            f"Your {payload['purpose']} code is {payload['code']}.\n\n"
            f"Expires at {payload['expires_at']}. Use it once, in the requesting app.\n"
            "Local development: this message was delivered only to the synthetic test inbox.\n"
        )
        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=5) as smtp:
            smtp.send_message(message)


def deliver_one(service, sender):
    now = service.clock()
    lease = str(uuid4())
    with service.sessions.begin() as database:
        database.execute(delete(RateBucket).where(RateBucket.expires_at <= now))
        database.execute(
            update(IdentityMail)
            .where(IdentityMail.expires_at <= now, IdentityMail.payload_cipher.is_not(None))
            .values(status="expired", payload_cipher=None, lease_token=None)
        )
        database.execute(
            update(IdentityMail)
            .where(
                IdentityMail.status == "processing",
                IdentityMail.attempts >= 3,
                IdentityMail.available_at <= now,
            )
            .values(status="unknown", payload_cipher=None, lease_token=None)
        )
        job = database.scalar(
            select(IdentityMail)
            .where(
                IdentityMail.status.in_(["queued", "retry", "processing"]),
                IdentityMail.available_at <= now,
                IdentityMail.expires_at > now,
                IdentityMail.attempts < 3,
            )
            .order_by(IdentityMail.available_at, IdentityMail.id)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if job is None:
            return "idle"
        challenge = database.get(Challenge, job.id)
        if challenge.consumed_at is not None:
            job.status = "cancelled"
            job.payload_cipher = None
            return "cancelled"
        job.status = "processing"
        job.attempts += 1
        job.lease_token = lease
        job.available_at = now + timedelta(seconds=60)
        identifier = job.id
        payload = service.security.open(job.payload_cipher)

    with service.sessions() as database:
        current = database.get(IdentityMail, identifier)
        challenge = database.get(Challenge, identifier)
        eligible = (
            current.lease_token == lease
            and challenge.consumed_at is None
            and current.expires_at > service.clock()
        )
    delivered = False
    if eligible:
        try:
            sender(json.loads(payload))
            delivered = True
        except (OSError, smtplib.SMTPException):
            delivered = False
    with service.sessions.begin() as database:
        current = database.scalar(
            select(IdentityMail).where(IdentityMail.id == identifier).with_for_update()
        )
        if current.lease_token != lease:
            return "lease_lost"
        current.lease_token = None
        if not eligible:
            current.status = "cancelled"
            current.payload_cipher = None
        elif delivered:
            current.status = "sent"
            current.sent_at = service.clock()
            current.payload_cipher = None
        else:
            current.status = "retry" if current.attempts < 3 else "failed"
            current.available_at = service.clock() + timedelta(seconds=30)
            if current.status == "failed":
                current.payload_cipher = None
        return current.status