import os
import subprocess
import uuid
import shutil
import tempfile

from flask import Flask, request, jsonify, send_file, send_from_directory


APP_VERSION = "1.2"

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MODELS_DIR = os.path.join(BASE_DIR, "models")
UPLOAD_DIR = "/tmp/scad_work"

ALLOWED_MODEL_EXTENSIONS = (".scad", ".csg", ".stl", ".obj", ".3mf")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ---------------------------------------------------------
# Static files
# ---------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(
        STATIC_DIR,
        "favicon.ico",
        mimetype="image/x-icon",
        max_age=0
    )


@app.route("/svg/<path:filename>")
def serve_svg(filename):
    return send_from_directory(
        os.path.join(STATIC_DIR, "svg"),
        filename,
        mimetype="image/svg+xml"
    )


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def validate_filename(filename):
    """Validate a filename for the flat models directory."""

    if not isinstance(filename, str):
        raise ValueError("Invalid filename")

    filename = filename.strip()

    if (
        not filename
        or filename in (".", "..")
        or "/" in filename
        or "\\" in filename
        or "\0" in filename
    ):
        raise ValueError("Invalid filename")

    return filename


def get_safe_path(filename):
    """Resolve a filename directly inside MODELS_DIR."""

    filename = validate_filename(filename)

    base = os.path.realpath(MODELS_DIR)
    path = os.path.join(base, filename)

    # Do not allow symlinks in the models directory.
    if os.path.islink(path):
        raise ValueError("Symbolic links are not allowed")

    full_path = os.path.realpath(path)

    if os.path.commonpath([base, full_path]) != base:
        raise ValueError("Invalid path")

    return full_path


def parse_json_response_data():
    return request.get_json(silent=True) or {}


def get_uploaded_filename():
    """Get and validate the uploaded filename."""

    if "file" not in request.files:
        raise ValueError("No file uploaded")

    file = request.files["file"]

    filename = request.form.get("filename") or file.filename or ""
    filename = validate_filename(filename)

    if not file.filename:
        raise ValueError("No filename provided")

    return file, filename


# ---------------------------------------------------------
# Models API
# ---------------------------------------------------------

@app.route("/api/models", methods=["GET"])
def list_models():
    try:
        files = []

        with os.scandir(MODELS_DIR) as entries:
            for entry in entries:
                if entry.name.startswith("."):
                    continue

                if entry.name == "_export":
                    continue

                if not entry.is_file(follow_symlinks=False):
                    continue

                if entry.name.lower().endswith(ALLOWED_MODEL_EXTENSIONS):
                    files.append(entry.name)

        files.sort(key=str.lower)

        return jsonify({"files": files})

    except OSError:
        app.logger.exception("Failed to list models")
        return jsonify({"error": "Failed to list models"}), 500


# ---------------------------------------------------------
# Get / open model
# ---------------------------------------------------------

@app.route("/api/models/<filename>", methods=["GET"])
def get_model(filename):
    try:
        path = get_safe_path(filename)

        if not os.path.isfile(path):
            return jsonify({"error": "File not found"}), 404

        extension = os.path.splitext(filename)[1].lower()

        content_types = {
            ".stl": "application/sla",
            ".obj": "text/plain",
            ".3mf": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
        }

        if extension in content_types:
            return send_file(
                path,
                mimetype=content_types[extension],
                as_attachment=False
            )

        if extension not in (".scad", ".csg"):
            return jsonify({"error": "Unsupported file type"}), 415

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        return jsonify({
            "filename": filename,
            "path": filename,
            "content": content
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except OSError:
        app.logger.exception("Failed to retrieve model: %s", filename)
        return jsonify({"error": "Failed to retrieve model"}), 500


# ---------------------------------------------------------
# Download model
# ---------------------------------------------------------

@app.route("/api/models/<filename>/download", methods=["GET"])
def download_model(filename):
    try:
        path = get_safe_path(filename)

        if not os.path.isfile(path):
            return jsonify({"error": "File not found"}), 404

        return send_file(
            path,
            as_attachment=True,
            download_name=filename
        )

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except OSError:
        app.logger.exception("Failed to download model: %s", filename)
        return jsonify({"error": "Failed to download file"}), 500


# ---------------------------------------------------------
# Create / upload model
# ---------------------------------------------------------

@app.route("/api/models", methods=["POST"])
def create_model():
    try:
        file, filename = get_uploaded_filename()

        if not filename.lower().endswith(".scad"):
            return jsonify({
                "error": "Only SCAD files are supported"
            }), 415

        dest_path = get_safe_path(filename)

        # Exclusive creation: never overwrite an existing model.
        try:
            fd = os.open(
                dest_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o644
            )
        except FileExistsError:
            return jsonify({
                "error": "A file with that name already exists"
            }), 409

        with os.fdopen(fd, "wb") as output:
            file.save(output)

        return jsonify({
            "success": True,
            "filename": filename
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except OSError:
        app.logger.exception("Failed to save model")
        return jsonify({"error": "Failed to save model"}), 500


# ---------------------------------------------------------
# Rename model
# ---------------------------------------------------------

@app.route("/api/models/<filename>", methods=["PATCH"])
def rename_model(filename):
    data = parse_json_response_data()
    new_name = data.get("newName", "")

    try:
        new_name = validate_filename(new_name)

        old_path = get_safe_path(filename)
        new_path = get_safe_path(new_name)

        if not os.path.isfile(old_path):
            return jsonify({"error": "File not found"}), 404

        if old_path == new_path:
            return jsonify({
                "success": True,
                "filename": new_name
            }), 200

        # Atomic no-overwrite operation for regular files.
        try:
            os.link(old_path, new_path)
        except FileExistsError:
            return jsonify({
                "error": "A file with that name already exists"
            }), 409

        try:
            os.unlink(old_path)
        except OSError:
            # Roll back the new link if the original cannot be removed.
            try:
                os.unlink(new_path)
            except OSError:
                app.logger.exception("Failed to roll back rename")

            raise

        return jsonify({
            "success": True,
            "filename": new_name
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except OSError:
        app.logger.exception(
            "Failed to rename model from %s to %s",
            filename,
            new_name
        )
        return jsonify({"error": "Failed to rename file"}), 500


# ---------------------------------------------------------
# Delete model
# ---------------------------------------------------------

@app.route("/api/models/<filename>", methods=["DELETE"])
def delete_model(filename):
    try:
        target_path = get_safe_path(filename)

        if not os.path.isfile(target_path):
            return jsonify({"error": "File not found"}), 404

        os.remove(target_path)

        return jsonify({
            "success": True,
            "filename": filename
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except OSError:
        app.logger.exception("Failed to delete model: %s", filename)
        return jsonify({"error": "Failed to delete file"}), 500


# ---------------------------------------------------------
# Export model
# ---------------------------------------------------------

@app.route("/api/models/export", methods=["POST"])
def export_model():
    try:
        file, filename = get_uploaded_filename()

        if not filename.lower().endswith(".stl"):
            filename += ".stl"

        export_dir = os.path.join(MODELS_DIR, "_export")
        os.makedirs(export_dir, exist_ok=True)

        dest_path = os.path.join(export_dir, filename)

        # Export files may be replaced by subsequent exports.
        file.save(dest_path)

        return jsonify({
            "success": True,
            "filename": filename
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    except OSError:
        app.logger.exception("Failed to export model")
        return jsonify({"error": "Failed to export model"}), 500


# ---------------------------------------------------------
# Render model
# ---------------------------------------------------------

@app.route("/api/render", methods=["POST"])
def render_model():
    data = parse_json_response_data()

    code = data.get("code", "")
    params = data.get("params", {})
    is_preview = data.get("preview", False)

    if not isinstance(code, str) or not code.strip():
        return jsonify({"error": "No code provided"}), 400

    if not isinstance(params, dict):
        return jsonify({"error": "Invalid parameters"}), 400

    openscad = shutil.which("openscad-nightly")

    if not openscad:
        return jsonify({
            "error": "OpenSCAD nightly executable not found"
        }), 500

    task_id = str(uuid.uuid4())

    scad_path = os.path.join(UPLOAD_DIR, f"{task_id}.scad")
    output_path = os.path.join(UPLOAD_DIR, f"{task_id}.3mf")

    def cleanup():
        for path in (scad_path, output_path):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                app.logger.warning(
                    "Failed to remove temporary file: %s", path
                )

    try:
        with open(scad_path, "w", encoding="utf-8") as f:
            f.write(code)

        cmd = [
            openscad,
            "--backend=manifold",
            scad_path,
            "-o",
            output_path
        ]

        if is_preview:
            cmd.extend([
                "-D", "$fs=4.0",
                "-D", "$fa=20.0",
                "-D", "$fn=12"
            ])

        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=60 * 5
        )

        output_generated = (
            result.returncode == 0
            and os.path.isfile(output_path)
            and os.path.getsize(output_path) > 0
        )

        if not output_generated:
            error_message = (
                result.stderr.strip()
                or result.stdout.strip()
                or "OpenSCAD failed to generate 3MF"
            )

            cleanup()

            return jsonify({
                "error": error_message
            }), 500

        response = send_file(
            output_path,
            mimetype="model/3mf",
            as_attachment=False,
            download_name="model.3mf"
        )

        response.call_on_close(cleanup)

        try:
            os.remove(scad_path)
        except OSError:
            app.logger.warning(
                "Failed to remove temporary SCAD file: %s",
                scad_path
            )

        return response

    except subprocess.TimeoutExpired:
        cleanup()

        return jsonify({
            "error": "OpenSCAD rendering timed out (300 seconds)"
        }), 504

    except OSError:
        cleanup()

        app.logger.exception("OpenSCAD rendering failed")

        return jsonify({
            "error": "Failed to execute OpenSCAD"
        }), 500


# ---------------------------------------------------------
# Application
# ---------------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000
    )
