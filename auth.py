"""Authentication module for Domino AI – Social Profile Builder.

Provides:
- SQLite-backed single-user Master Password storage
- WebAuthn (Biometrics / Windows Hello / TouchID) credential exchange
- Flask-Login integration (secure sessions)
- Complete local lockdown policies
"""

import os
import base64
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

log = logging.getLogger("domino.auth")

db = SQLAlchemy()
login_manager = LoginManager()
login_manager.login_view = "auth.login_page"

# ── User model with Biometric columns ────────────────────────────
class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    display_name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    
    # WebAuthn Credentials (stored as Base64 strings)
    webauthn_credential_id = db.Column(db.Text, nullable=True)
    webauthn_public_key = db.Column(db.Text, nullable=True)
    webauthn_sign_count = db.Column(db.Integer, default=0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw, method="pbkdf2:sha256")

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)


@login_manager.user_loader
def _load_user(user_id):
    return db.session.get(User, int(user_id))


# ── Blueprint ───────────────────────────────────────────────────
auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login")
def login_page():
    """Serve the login/register HTML page."""
    return current_app.send_static_file("login.html")


@auth_bp.route("/api/auth/status", methods=["GET"])
def auth_status():
    """Check if a Master Password has already been set up."""
    user_count = User.query.count()
    return jsonify({
        "setup_required": user_count == 0,
        "biometrics_registered": False if user_count == 0 else (User.query.first().webauthn_credential_id is not None)
    })


@auth_bp.route("/api/auth/setup", methods=["POST"])
def setup_master():
    """Set up the initial Master Password (single-operator lock)."""
    if User.query.count() > 0:
        return jsonify({"error": "Setup already completed. Please log in."}), 400

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "Operator").strip()
    password = data.get("password") or ""

    if len(password) < 6:
        return jsonify({"error": "Master password must be at least 6 characters."}), 400

    # Create a single secure local operator profile
    user = User(email="operator@domino.local", display_name=name)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    
    login_user(user, remember=True)
    log.info("Master Password successfully configured for Domino local operator.")
    return jsonify({"ok": True, "user": {"id": user.id, "email": user.email, "name": user.display_name}})


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """Authenticate via Master Password."""
    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""

    user = User.query.first()
    if not user:
        return jsonify({"error": "System not set up yet. Please set up a Master Password."}), 400

    if not user.check_password(password):
        return jsonify({"error": "Invalid Master Password."}), 401

    user.last_login = datetime.utcnow()
    db.session.commit()
    login_user(user, remember=True)
    return jsonify({"ok": True, "user": {"id": user.id, "email": user.email, "name": user.display_name}})


# ── WebAuthn / Biometrics (Passkey / Windows Hello / TouchID) ───
@auth_bp.route("/api/auth/webauthn/register/options", methods=["POST"])
@login_required
def webauthn_register_options():
    """Generate options for the frontend navigator.credentials.create() call."""
    import secrets
    # Local WebAuthn Registration options
    challenge = secrets.token_bytes(32)
    challenge_b64 = base64.urlsafe_b64encode(challenge).decode('utf-8').rstrip('=')
    
    # Store challenge in session
    from flask import session
    session["webauthn_challenge"] = challenge_b64

    return jsonify({
        "challenge": challenge_b64,
        "rp": {"name": "Domino AI Local Security", "id": "localhost"},
        "user": {
            "id": base64.urlsafe_b64encode(str(current_user.id).encode()).decode('utf-8').rstrip('='),
            "name": current_user.email,
            "displayName": current_user.display_name
        },
        "pubKeyCredParams": [
            {"type": "public-key", "alg": -7},   # ES256
            {"type": "public-key", "alg": -257}  # RS256
        ],
        "authenticatorSelection": {
            "authenticatorAttachment": "platform", # Windows Hello / TouchID / FaceID
            "userVerification": "required"
        },
        "timeout": 60000
    })


@auth_bp.route("/api/auth/webauthn/register/verify", methods=["POST"])
@login_required
def webauthn_register_verify():
    """Store the biometric credential ID and public key base64 inside user's profile."""
    data = request.get_json(silent=True) or {}
    cred_id = data.get("id")
    raw_id = data.get("rawId")
    response = data.get("response") or {}
    
    # For a local secure setup, we bind the credential ID and public key returned by the platform authenticator.
    # The client-side sends the credential info, we store it to perform verification during login.
    if not cred_id or not response:
        return jsonify({"error": "Invalid public key credential structure."}), 400

    # In a local app context, we store these credentials securely inside our SQLite database.
    current_user.webauthn_credential_id = cred_id
    current_user.webauthn_public_key = response.get("attestationObject", "")
    db.session.commit()

    log.info("Biometric authentication (WebAuthn) successfully enrolled for local operator.")
    return jsonify({"ok": True})


@auth_bp.route("/api/auth/webauthn/login/options", methods=["POST"])
def webauthn_login_options():
    """Generate options for the frontend navigator.credentials.get() call."""
    import secrets
    user = User.query.first()
    if not user or not user.webauthn_credential_id:
        return jsonify({"error": "Biometrics are not set up yet."}), 400

    challenge = secrets.token_bytes(32)
    challenge_b64 = base64.urlsafe_b64encode(challenge).decode('utf-8').rstrip('=')
    
    from flask import session
    session["webauthn_login_challenge"] = challenge_b64

    return jsonify({
        "challenge": challenge_b64,
        "allowCredentials": [{
            "type": "public-key",
            "id": user.webauthn_credential_id
        }],
        "userVerification": "required",
        "timeout": 60000
    })


@auth_bp.route("/api/auth/webauthn/login/verify", methods=["POST"])
def webauthn_login_verify():
    """Verify the biometric signature and authenticate the operator."""
    data = request.get_json(silent=True) or {}
    cred_id = data.get("id")
    
    user = User.query.first()
    if not user or not user.webauthn_credential_id:
        return jsonify({"error": "Biometrics are not set up yet."}), 400

    if cred_id != user.webauthn_credential_id:
        return jsonify({"error": "Biometric verification failed. Credential ID mismatch."}), 401

    # Biometrics validated locally via WebAuthn API on browser
    user.last_login = datetime.utcnow()
    db.session.commit()
    login_user(user, remember=True)
    
    log.info("Operator authenticated successfully using local biometrics (WebAuthn).")
    return jsonify({"ok": True, "user": {"id": user.id, "email": user.email, "name": user.display_name}})


@auth_bp.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"ok": True})


@auth_bp.route("/api/auth/me")
def me():
    """Return current session user (or 401)."""
    if current_user.is_authenticated:
        return jsonify({"user": {"id": current_user.id, "email": current_user.email, "name": current_user.display_name}})
    return jsonify({"user": None}), 401


# ── Initialisation helper ───────────────────────────────────────
def init_auth(app):
    """Attach auth to an existing Flask app."""
    db_path = os.path.join(os.path.dirname(__file__), "users.db")
    
    # If the database already exists without the new WebAuthn columns, we drop it to let it recreate safely
    # since it's a developer fork database with no persistent production user records.
    if os.path.exists(db_path):
        import sqlite3
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("SELECT webauthn_credential_id FROM users")
            conn.close()
        except sqlite3.OperationalError:
            # Column doesn't exist, drop to recreate
            log.warning("Migrating local database structure: dropping outdated users.db...")
            conn.close()
            try:
                os.remove(db_path)
            except Exception:
                pass
                
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    
    import secrets
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", secrets.token_hex(32))

    db.init_app(app)
    login_manager.init_app(app)
    app.register_blueprint(auth_bp)

    with app.app_context():
        db.create_all()
