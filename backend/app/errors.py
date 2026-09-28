class DomainError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def authentication_required():
    return DomainError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.")


def invalid_challenge():
    return DomainError(400, "CHALLENGE_INVALID", "This code is invalid, expired or already used.")