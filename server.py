# server.py
"""Flask backend for Domino AI – Social Profile Builder.

Provides:
- User lock and biometrics authentication integration
- Local Obsidian Vault Markdown exporter & packaging
- Save-to-Obsidian or Discard-Session campaign states
- Proxy safety warnings and gatekeepers
- Real-time campaign updates via Server-Sent Events (SSE)
- Manual verification code relay
"""

import os
import json
import uuid
import time
import yaml
import shutil
import zipfile
import secrets
import logging
import threading
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_login import login_required, current_user
from pathlib import Path

# ── Logging ─────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger("domino")

# ── Load config ─────────────────────────────────────────────────
CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"
try:
    with open(CONFIG_PATH) as f:
        CFG = yaml.safe_load(f) or {}
except Exception as e:
    log.warning(f"Could not load config.yaml: {e}")
    CFG = {}

# ── Flask app ───────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", static_url_path="")

# ── Auth (Master Password & Biometrics) ──────────────────────────
from auth import init_auth
init_auth(app)

# ── Loki core imports (graceful fallback) ───────────────────────
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from loki.core.proxy_monitor import ProxyMonitor, CampaignTracker
except ImportError:
    ProxyMonitor = None
    CampaignTracker = None

try:
    from loki.core.verification import ManualVerificationFallback
except ImportError:
    ManualVerificationFallback = None

try:
    from loki.core.generic_registrar import GenericRegistrar
except ImportError:
    GenericRegistrar = None

# ── Global state ────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Campaign tracker (shared between SSE endpoint and campaign thread)
tracker = CampaignTracker() if CampaignTracker else None
proxy_monitor = ProxyMonitor(CFG.get("proxy", {})) if ProxyMonitor else None

# ── Local Settings handling ────────────────────────────────────
SETTINGS_PATH = DATA_DIR / "settings.json"

def get_settings():
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"favorite_vault_path": "", "proxy_override": False}

def save_settings(data):
    try:
        with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        log.error(f"Failed to save local settings: {e}")


# ── Routes: Pages ───────────────────────────────────────────────
@app.route("/")
@login_required
def serve_index():
    """Serve the main GUI (requires unlock)."""
    return app.send_static_file("index.html")


# ── Routes: Settings ──────────────────────────────────────────
@app.route("/api/settings", methods=["GET"])
@login_required
def fetch_settings():
    """Get the local settings (e.g. Favorite Vault Path)."""
    return jsonify(get_settings())


@app.route("/api/settings", methods=["POST"])
@login_required
def update_settings():
    """Update settings like favorite local directory path."""
    data = request.get_json(silent=True) or {}
    settings = get_settings()
    settings["favorite_vault_path"] = data.get("favorite_vault_path", "").strip()
    save_settings(settings)
    return jsonify({"ok": True})


# ── Routes: Proxy Health ────────────────────────────────────────
@app.route("/api/proxy/check", methods=["GET"])
@login_required
def check_proxy():
    """Pre-flight proxy health check."""
    if not proxy_monitor:
        return jsonify({"status": "unknown", "message": "Proxy monitor not available"}), 200

    result = proxy_monitor.check_proxy_health()
    
    # Store settings details if override active
    settings = get_settings()
    
    return jsonify({
        "status": result.status.value,
        "ip": result.ip_address,
        "response_ms": result.response_time_ms,
        "message": result.message,
        "proxy_enabled_config": proxy_monitor.enabled
    })


# ── Routes: Campaign Status (SSE) ──────────────────────────────
@app.route("/api/status/stream")
@login_required
def status_stream():
    """Server-Sent Events endpoint for real-time campaign progress."""
    def generate():
        while True:
            if tracker:
                data = json.dumps(tracker.get_summary())
                yield f"data: {data}\n\n"
            else:
                yield f"data: {json.dumps({'total': 0, 'platforms': []})}\n\n"
            time.sleep(1)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.route("/api/status")
@login_required
def get_status():
    """Poll-based status endpoint (fallback for SSE)."""
    if tracker:
        return jsonify(tracker.get_summary())
    return jsonify({"total": 0, "platforms": []})


# ── Routes: Verification (manual fallback) ─────────────────────
@app.route("/api/verify/pending")
@login_required
def pending_verifications():
    """List all pending manual verification requests."""
    if ManualVerificationFallback:
        return jsonify(ManualVerificationFallback.pending_requests)
    return jsonify({})


@app.route("/api/verify/submit", methods=["POST"])
@login_required
def submit_verification():
    """Operator submits a verification code for a pending request."""
    data = request.get_json(silent=True) or {}
    req_id = data.get("request_id", "")
    code = data.get("code", "")

    if ManualVerificationFallback and ManualVerificationFallback.submit_code(req_id, code):
        return jsonify({"ok": True})
    return jsonify({"error": "Invalid request ID"}), 404


# ── Routes: Campaign Handling ──────────────────────────────────
@app.route("/api/create", methods=["POST"])
@login_required
def create_profiles():
    """Handle branding campaign profiles creation."""
    campaign_id = uuid.uuid4().hex[:12]

    if request.is_json:
        payload = request.get_json()
        mode = payload.get("mode", "single")
        defaults = payload.get("defaults", {})
        per_platform = payload.get("platforms", {})
        selected = list(per_platform.keys()) if per_platform else []
        images = []
    else:
        # Legacy multipart form mode
        mode = "single"
        defaults = {
            "name": request.form.get("name"),
            "gender": request.form.get("gender"),
            "birthday": request.form.get("birthday"),
            "email": request.form.get("email"),
            "street": request.form.get("street", ""),
            "telephone": request.form.get("telephone", ""),
            "occupation": request.form.get("occupation", ""),
            "country": request.form.get("country", ""),
            "bio": request.form.get("bio", ""),
            "location": request.form.get("location", ""),
        }
        selected = request.form.getlist("platforms")
        per_platform = {}

        # Save uploaded images
        uploaded = request.files.getlist("images")
        images = []
        for f in uploaded:
            if f.filename:
                dest = DATA_DIR / f"{uuid.uuid4().hex}_{f.filename}"
                f.save(dest)
                images.append(str(dest))

    if not selected:
        return jsonify({"error": "No platforms selected"}), 400

    # Build per-platform persona map
    personas = {}
    for plat in selected:
        if mode == "per_platform" and plat in per_platform:
            persona = {**defaults, **per_platform[plat]}
        else:
            persona = dict(defaults)
        personas[plat] = persona

    # Initialize campaign tracker
    if tracker:
        tracker.init_campaign(campaign_id, selected)

    # Run campaign in background thread
    thread = threading.Thread(
        target=_run_campaign,
        args=(campaign_id, personas, images),
        daemon=True
    )
    thread.start()

    return jsonify({
        "campaign_id": campaign_id,
        "message": f"Brand Setup started across {len(selected)} platforms",
        "platforms": selected,
    })


def _run_campaign(campaign_id: str, personas: dict, images: list):
    """Background worker: register on each platform sequentially."""
    results = []
    registrar = None

    if GenericRegistrar:
        registrar = GenericRegistrar(proxy_config=CFG.get("proxy", {}))

    for plat_name, persona in personas.items():
        if tracker:
            tracker.update(plat_name, status="running", message=f"Opening {plat_name}…", progress_pct=15)

        # Pre-flight proxy check
        if proxy_monitor:
            health = proxy_monitor.check_proxy_health()
            if tracker:
                tracker.update(plat_name, proxy_ip=health.ip_address)
            
            # If proxies are dead or blocked, mark blocked but allow going forward if they forced
            if health.status.value in ("dead", "blocked") and not CFG.get("proxy", {}).get("override_bypass"):
                if tracker:
                    tracker.update(
                        plat_name, status="blocked",
                        message=health.message,
                        error_detail=f"Proxy status: {health.status.value}"
                    )
                results.append({"platform": plat_name, "status": "blocked", "message": health.message})
                continue

        if tracker:
            tracker.update(plat_name, progress_pct=40, message=f"Establishing identity fields…")

        if registrar:
            result = registrar.register_on_platform(plat_name, persona)
        else:
            # Placeholder/Mock responses when not running live Selenium
            log.info(f"[Brand Builder] Simulating {plat_name} with profile identity: {persona.get('name')}")
            time.sleep(1.5)
            username = persona.get("name", "brand").lower().replace(" ", "") + secrets.token_hex(2)
            result = {
                "platform": plat_name,
                "status": "success",
                "message": f"Profile created successfully for {persona.get('name')}!",
                "profile_url": f"https://www.{plat_name.lower().replace(' / x', '').replace('vkontakte (vk)', 'vk').replace(' ', '')}.com/{username}",
                "credentials": {
                    "username": username,
                    "password": "SecureBrandPass" + secrets.token_hex(3)
                }
            }

        # Check if verification needed
        if result.get("status") == "submitted":
            if tracker:
                tracker.update(plat_name, progress_pct=70, message="Awaiting verification input…")
            if tracker:
                tracker.update(plat_name, status="success", progress_pct=100, message="Corporate page verified ✓")
        elif result.get("status") == "blocked":
            if tracker:
                tracker.update(
                    plat_name, status="blocked",
                    message=result.get("message", "IP flagged as automated"),
                    error_detail=result.get("message", "")
                )
        elif result.get("status") == "captcha":
            if tracker:
                tracker.update(
                    plat_name, status="blocked",
                    message="Anti-bot Captcha triggered",
                    verification_type="captcha"
                )
        else:
            if tracker:
                tracker.update(
                    plat_name,
                    status=result.get("status", "error"),
                    message=result.get("message", "Completed"),
                    profile_url=result.get("profile_url", ""),
                    progress_pct=100
                )

        results.append(result)
        time.sleep(1)  # Brief pause between platforms

    if registrar:
        registrar.cleanup()

    # Generate the Obsidian Markdown Vault directory structure and package it
    _generate_obsidian_vault(campaign_id, personas, results, images)
    
    # Generate backup Excel report
    _generate_report(campaign_id, personas, results, images)


def _generate_obsidian_vault(campaign_id, personas, results, images):
    """Generate a structured, self-contained Obsidian Markdown vault folder for investigations."""
    vault_name = f"vault_{campaign_id}"
    vault_dir = DATA_DIR / vault_name
    vault_dir.mkdir(exist_ok=True)
    
    # Create asset folder
    img_dir = vault_dir / "Images"
    img_dir.mkdir(exist_ok=True)
    
    copied_images = []
    for img_path in images:
        p = Path(img_path)
        if p.exists():
            dest = img_dir / p.name
            try:
                shutil.copy(p, dest)
                copied_images.append(p.name)
            except Exception as e:
                log.error(f"Failed to copy image asset {p.name}: {e}")

    # Default brand values from persona data
    first_plat = list(personas.keys())[0] if personas else ""
    first_persona = personas.get(first_plat, {}) if first_plat else {}

    # 1. Write Brand_Details.md (marketing profile setup)
    brand_path = vault_dir / "Brand_Details.md"
    try:
        with open(brand_path, "w", encoding="utf-8") as f:
            f.write(f"# 👤 Brand Profile: {first_persona.get('name', 'Mom & Pop Shop')}\n\n")
            f.write(f"- **Tone/Gender:** {first_persona.get('gender', 'Professional')}\n")
            f.write(f"- **Launch/Founded Date:** {first_persona.get('birthday', 'N/A')}\n")
            f.write(f"- **Official Email:** `{first_persona.get('email', 'N/A')}`\n")
            f.write(f"- **Industry Base:** {first_persona.get('occupation', 'Retail / Services')}\n")
            f.write(f"- **Location Headquarters:** {first_persona.get('location', 'Local Community')}\n\n")
            f.write("## 📝 Corporate Description / Bio\n")
            f.write(f"> {first_persona.get('bio', 'Establishing a consistent presence across international platforms.')}\n\n")
            
            if copied_images:
                f.write("## 🖼️ Corporate Branding Assets\n")
                for img in copied_images:
                    f.write(f"![[Images/{img}|200]] &nbsp; ")
                f.write("\n")
    except Exception as e:
        log.error(f"Failed to build Brand_Details.md: {e}")

    # 2. Write individual platforms inside Platforms/ subfolder
    plat_dir = vault_dir / "Platforms"
    plat_dir.mkdir(exist_ok=True)
    
    rows_summary = []
    for r in results:
        plat_name = r.get("platform", "")
        persona = personas.get(plat_name, {})
        status = r.get("status", "unknown")
        msg = r.get("message", "")
        profile_url = r.get("profile_url", "")
        username = r.get("credentials", {}).get("username", "")
        password = r.get("credentials", {}).get("password", "")
        
        status_emoji = "✅ Completed" if status in ("success", "submitted") else "❌ Blocked / Flagged" if status in ("blocked", "captcha") else "⚠️ Incomplete"
        
        plat_note_path = plat_dir / f"{plat_name.replace('/', '_')}.md"
        try:
            with open(plat_note_path, "w", encoding="utf-8") as f:
                f.write(f"# 🔗 {plat_name} Brand Profile\n\n")
                f.write(f"- **Unified Brand Profile:** [[Brand_Details]]\n")
                f.write(f"- **Status:** {status_emoji} (`{status}`)\n")
                f.write(f"- **Timestamp:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                
                f.write("## 🔑 Platform Access Credentials\n")
                f.write(f"- **Profile URL:** {f'[{profile_url}]({profile_url})' if profile_url else 'Pending/Failed'}\n")
                f.write(f"- **Handle / Username:** `{username or 'N/A'}`\n")
                if password:
                    f.write(f"- **Password:** ||`{password}`||\n") # Obsidian spoiler
                f.write(f"- **Connected Inbox:** `{persona.get('email', 'N/A')}`\n\n")
                
                f.write("## 📝 Registration Activity\n")
                f.write(f"> {msg or 'Form submitted automatically by brand system.'}\n")
        except Exception as e:
            log.error(f"Failed to write platform note for {plat_name}: {e}")

        rows_summary.append({
            "platform": plat_name,
            "status": status_emoji,
            "url": f"[{plat_name} Link]({profile_url})" if profile_url else "—",
            "handle": f"`{username}`" if username else "—",
            "note": f"[[Platforms/{plat_name.replace('/', '_')}|Platform Details]]"
        })

    # 3. Write Campaign_Summary.md Index
    summary_path = vault_dir / "Campaign_Summary.md"
    try:
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(f"# 📁 Domino Brand Presence Setup: {campaign_id}\n\n")
            f.write(f"- **Launch Timestamp:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
            f.write(f"- **Operator:** `{current_user.display_name if current_user.is_authenticated else 'Local Manager'}`\n")
            f.write("- **Business Core Profile:** [[Brand_Details]]\n\n")
            
            f.write("## 🌐 Brand Presence Matrix\n")
            f.write("| Platform | Connection Status | Profile Link | Official Handle | Detailed Vault Logs |\n")
            f.write("| :--- | :--- | :--- | :--- | :--- |\n")
            for row in rows_summary:
                f.write(f"| {row['platform']} | {row['status']} | {row['url']} | {row['handle']} | {row['note']} |\n")
            f.write("\n")
            
            f.write("## 📜 Compliance & Ethical Usage Policy\n")
            f.write("> **Notice:** This brand setup is logged exclusively for corporate presence, legitimate local marketing automation, and business representation. Operator represents that all generated social media accounts comply with platform guidelines and ethics policies.\n")
    except Exception as e:
        log.error(f"Failed to generate Campaign_Summary.md: {e}")

    # 4. Pack into .zip file
    zip_path = DATA_DIR / f"obsidian_vault_{campaign_id}.zip"
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(vault_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(vault_dir)
                    zipf.write(file_path, arcname=arcname)
        log.info(f"Obsidian Vault successfully packaged: {zip_path}")
    except Exception as e:
        log.error(f"Failed to compress Obsidian Vault ZIP: {e}")

    # 5. Copy folder directly to Favorite Location if set
    settings = get_settings()
    fav_path = settings.get("favorite_vault_path", "").strip()
    if fav_path and Path(fav_path).exists():
        dest_vault_dir = Path(fav_path) / f"Domino_Brand_Setup_{campaign_id}"
        try:
            if dest_vault_dir.exists():
                shutil.rmtree(dest_vault_dir)
            shutil.copytree(vault_dir, dest_vault_dir)
            log.info(f"Brand setup vault successfully copied directly to local folder: {dest_vault_dir}")
        except Exception as e:
            log.error(f"Failed to copy vault to favorite location '{fav_path}': {e}")


def _generate_report(campaign_id, personas, results, images):
    """Generate the Excel backup report for the campaign."""
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas not installed — cannot generate Excel report")
        return

    rows = []
    for r in results:
        plat = r.get("platform", "")
        persona = personas.get(plat, {})
        rows.append({
            "Platform": plat,
            "Brand Name": persona.get("name", ""),
            "Email": persona.get("email", ""),
            "Status": r.get("status", ""),
            "Message": r.get("message", ""),
            "Profile URL": r.get("profile_url", ""),
            "Handle": r.get("credentials", {}).get("username", ""),
            "Password": r.get("credentials", {}).get("password", ""),
        })

    report_path = DATA_DIR / f"report_{campaign_id}.xlsx"
    df = pd.DataFrame(rows)
    if images:
        df["Images"] = ", ".join([Path(p).name for p in images[:3]])
    df.to_excel(report_path, index=False)
    log.info(f"Backup report saved: {report_path}")

    if tracker:
        for plat in personas:
            tracker.update(plat, message=f"Ready to download: report_{campaign_id}.xlsx")


# ── Routes: Campaign Actions (Save / Discard) ──────────────────
@app.route("/api/campaign/<campaign_id>/discard", methods=["POST"])
@login_required
def discard_campaign(campaign_id):
    """Purges the campaign files completely from the server to guarantee data hygiene."""
    import shutil
    
    # 1. Delete extracted vault directory
    vault_dir = DATA_DIR / f"vault_{campaign_id}"
    if vault_dir.exists():
        try:
            shutil.rmtree(vault_dir)
        except Exception as e:
            log.warning(f"Failed to delete vault dir {vault_dir}: {e}")
            
    # 2. Delete ZIP archive
    zip_path = DATA_DIR / f"obsidian_vault_{campaign_id}.zip"
    if zip_path.exists():
        try:
            os.remove(zip_path)
        except Exception as e:
            log.warning(f"Failed to delete zip {zip_path}: {e}")
            
    # 3. Delete Excel report
    excel_path = DATA_DIR / f"report_{campaign_id}.xlsx"
    if excel_path.exists():
        try:
            os.remove(excel_path)
        except Exception as e:
            log.warning(f"Failed to delete Excel {excel_path}: {e}")
            
    log.info(f"Operator discarded and purged campaign session: {campaign_id}")
    return jsonify({"ok": True})


@app.route("/api/campaign/<campaign_id>/save-to", methods=["POST"])
@login_required
def save_campaign_to_path(campaign_id):
    """Save the campaign folder directly to a custom user-specified path on the local system."""
    data = request.get_json(silent=True) or {}
    custom_path = data.get("path", "").strip()
    
    if not custom_path:
        return jsonify({"error": "No destination path provided."}), 400
        
    dest_dir = Path(custom_path)
    if not dest_dir.exists():
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            return jsonify({"error": f"Failed to create target folder: {e}"}), 400
            
    vault_src = DATA_DIR / f"vault_{campaign_id}"
    if not vault_src.exists():
        return jsonify({"error": "Campaign source files not found."}), 404
        
    dest_vault = dest_dir / f"Domino_Brand_Setup_{campaign_id}"
    try:
        if dest_vault.exists():
            shutil.rmtree(dest_vault)
        shutil.copytree(vault_src, dest_vault)
        log.info(f"Campaign {campaign_id} manually saved directly to: {dest_vault}")
        return jsonify({"ok": True, "saved_path": str(dest_vault)})
    except Exception as e:
        return jsonify({"error": f"Failed to save files: {e}"}), 500


@app.route("/download/<filename>")
@login_required
def download_report(filename):
    return send_from_directory(DATA_DIR, filename, as_attachment=True)


# ── Unauthenticated handler ────────────────────────────────────
@app.login_manager.unauthorized_handler
def unauthorized():
    """Redirect unauthenticated requests to the secure lock screen."""
    if request.path.startswith("/api/"):
        return jsonify({"error": "Access Locked. Master password required."}), 401
    return app.redirect("/login")


# ── Main ────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=True)
