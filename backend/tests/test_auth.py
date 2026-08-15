from jose import jwt

from app.auth import ALGORITHM, SECRET_KEY, create_access_token, hash_password, verify_password


def test_hash_password_does_not_store_plaintext():
    password = "Correct-Horse-Battery-Staple"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_verify_password_rejects_malformed_hash():
    assert verify_password("anything", "not-a-valid-bcrypt-hash") is False


def test_access_token_contains_subject_and_expiry():
    token = create_access_token({"sub": "test-user", "role": "cashier"})
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    assert payload["sub"] == "test-user"
    assert payload["role"] == "cashier"
    assert "exp" in payload
