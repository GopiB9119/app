class DomainError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None, retry_after: int = 900):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        # Seconds a 429 asks the apps to wait.
        self.retry_after = retry_after


def authentication_required():
    return DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.")


def invalid_challenge():
    return DomainError(400, "CHALLENGE_INVALID", "This code is invalid, expired or already used.")