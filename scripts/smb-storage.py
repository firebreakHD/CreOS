"""One bounded SMB operation. Credentials arrive on stdin and never on the command line."""
import errno
import json
import ntpath
import os
import re
import stat
import sys
import uuid

MAX_BYTES = 500 * 1024 * 1024
stream_started = False

class StorageFailure(Exception):
    def __init__(self, message, status=503):
        super().__init__(message)
        self.status = status

def relative(value, empty=False):
    if empty and value == "":
        return value
    if not isinstance(value, str) or not value or len(value) > 1400 or "\\" in value or value.startswith("/") or any(part in ("", ".", "..") or re.search(r"[:\x00-\x1f]", part) for part in value.split("/")):
        raise StorageFailure("Ungültiger SMB-Speicherpfad.", 400)
    return value

def emit(value):
    sys.stdout.buffer.write((json.dumps(value, ensure_ascii=False) + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()

def operate(command, source, output, client):
    config = command["config"]
    host, share = config["host"], config["share"]
    if not re.fullmatch(r"[a-zA-Z0-9.-]{1,253}", host) or re.search(r"[\\/<>:\"|?*\x00-\x1f]", share) or not share or share in (".", ".."):
        raise StorageFailure("Ungültige SMB-Freigabe.", 400)
    base = relative(config.get("baseFolder", ""), empty=True)
    root = "\\\\" + host + "\\" + share
    username = config["username"]
    if config.get("domain"):
        username = config["domain"] + "\\" + username
    client.register_session(host, username=username, password=command["password"], port=config["port"], encrypt=bool(config.get("encrypt")), require_signing=True, auth_protocol="ntlm", connection_timeout=20)
    options = {"port": config["port"]}

    def checked(part="", create=False):
        relative(part, empty=True)
        current = root
        all_parts = [p for p in (base + "/" + part).strip("/").split("/") if p]
        for index, name in enumerate(all_parts):
            current = ntpath.join(current, name)
            try:
                info = client.lstat(current, **options)
                if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
                    raise StorageFailure("SMB-Dateiverknüpfungen sind nicht erlaubt.", 400)
            except FileNotFoundError:
                if create and index < len(all_parts) - 1:
                    try:
                        client.mkdir(current, **options)
                    except FileExistsError:
                        pass
                    info = client.lstat(current, **options)
                    if not stat.S_ISDIR(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
                        raise StorageFailure("Ungültiger SMB-Ordner.", 400)
        return current

    operation = command["operation"]
    if operation == "test":
        folder = checked()
        if not stat.S_ISDIR(client.stat(folder, **options).st_mode):
            raise StorageFailure("SMB-Basisordner ist nicht verfügbar.", 404)
        # A real write/remove verifies NAS permissions; no project folders are created.
        probe = ntpath.join(folder, ".creatoros-connection-test-" + str(uuid.uuid4()) + ".tmp")
        created = False
        try:
            with client.open_file(probe, mode="xb", **options) as handle:
                created = True
                handle.write(b"CreatorOS SMB connection test\n")
        finally:
            if created:
                client.remove(probe, **options)
        return {"ok": True}

    target = checked(command["path"], operation in ("put", "move", "ensure"))
    if operation == "ensure":
        try:
            client.mkdir(target, **options)
            return {"ok": True, "created": True}
        except FileExistsError:
            info = client.lstat(target, **options)
            if not stat.S_ISDIR(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
                raise StorageFailure("Der Projektpfad ist kein Ordner.", 409)
            return {"ok": True, "created": False}
    if operation == "list":
        if not stat.S_ISDIR(client.stat(target, **options).st_mode):
            raise StorageFailure("Der Projektpfad ist kein Ordner.", 404)
        entries = []
        with client.scandir(target, **options) as items:
            for item in items:
                # Reparse points are intentionally omitted from the browser.
                if item.is_symlink() or item.smb_info.file_attributes & 0x400:
                    continue
                info = item.stat(follow_symlinks=False)
                entries.append({
                    "name": item.name,
                    "directory": item.is_dir(follow_symlinks=False),
                    "size": info.st_size,
                })
        return {"ok": True, "entries": entries}
    if operation == "mkdir":
        client.mkdir(target, **options)
        return {"ok": True}
    if operation == "put":
        size = command["size"]
        if not isinstance(size, int) or size <= 0 or size > MAX_BYTES:
            raise StorageFailure("Ungültige Dateigröße.", 413)
        temporary = target + "." + str(uuid.uuid4()) + ".upload"
        created = False
        try:
            with client.open_file(temporary, mode="xb", **options) as handle:
                created = True
                received = 0
                while True:
                    chunk = source.read(256 * 1024)
                    if not chunk:
                        break
                    received += len(chunk)
                    if received > size:
                        raise StorageFailure("Datei ist größer als angegeben.", 413)
                    handle.write(chunk)
                if received != size:
                    raise StorageFailure("Upload ist unvollständig.", 400)
            checked(command["path"])
            client.rename(temporary, target, **options)
            created = False
        finally:
            if created:
                client.remove(temporary, **options)
        return {"ok": True}
    if operation == "get":
        info = client.stat(target, **options)
        if not stat.S_ISREG(info.st_mode):
            raise StorageFailure("Keine Mediendatei.", 404)
        start, end, status_code = 0, info.st_size - 1, 200
        range_value = command.get("range")
        if range_value:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_value)
            if not match or not any(match.groups()):
                raise StorageFailure("Ungültiger Dateibereich.", 416)
            first, last = match.groups()
            if not first:
                start = max(0, info.st_size - int(last))
            else:
                start = int(first)
                if last:
                    end = min(end, int(last))
            if start > end or start >= info.st_size:
                raise StorageFailure("Dateibereich nicht verfügbar.", 416)
            status_code = 206
        with client.open_file(target, mode="rb", share_access="r", **options) as handle:
            global stream_started
            emit({"ok": True, "length": max(0, end - start + 1), "status": status_code, "contentRange": f"bytes {start}-{end}/{info.st_size}" if status_code == 206 else None})
            stream_started = True
            handle.seek(start)
            remaining = max(0, end - start + 1)
            while remaining:
                chunk = handle.read(min(256 * 1024, remaining))
                if not chunk:
                    raise StorageFailure("Datei wurde während des Lesens verändert.")
                output.write(chunk)
                output.flush()
                remaining -= len(chunk)
        return None
    if operation == "delete":
        try:
            client.remove(target, **options)
        except FileNotFoundError:
            pass
        if command["path"].startswith(("Media/Projects/", "Media/Tasks/")):
            parts = command["path"].split("/")[:-1]
            while len(parts) > 2:
                try:
                    client.rmdir(checked("/".join(parts)), **options)
                except OSError:
                    break
                parts.pop()
        return {"ok": True}
    if operation == "move":
        destination = checked(command["to"], True)
        client.rename(target, destination, **options)
        return {"ok": True}
    raise StorageFailure("Unbekannte SMB-Aktion.", 400)

def main():
    try:
        import smbclient
        smbclient.ClientConfig(skip_dfs=True)
        header = sys.stdin.buffer.readline(65537)
        if len(header) > 65536:
            raise StorageFailure("SMB-Anfrage ist zu groß.", 400)
        result = operate(json.loads(header), sys.stdin.buffer, sys.stdout.buffer, smbclient)
        if result is not None:
            emit(result)
    except Exception as error:
        if isinstance(error, StorageFailure):
            message, status_code = str(error), error.status
        elif isinstance(error, ModuleNotFoundError):
            message, status_code = "SMB-Laufzeit fehlt. Bitte das aktuelle Add-on installieren.", 503
        elif isinstance(error, FileNotFoundError):
            message, status_code = "SMB-Datei oder Basisordner ist nicht verfügbar.", 404
        elif isinstance(error, FileExistsError):
            message, status_code = "Dateiname existiert bereits.", 409
        elif isinstance(error, PermissionError) or getattr(error, "errno", None) in (errno.EACCES, errno.EPERM):
            message, status_code = "SMB-Anmeldung oder Schreibberechtigung fehlt.", 502
        else:
            # Never return raw library exceptions: they can contain usernames or paths.
            message, status_code = "SMB-Verbindung fehlgeschlagen. Host, Freigabe und Zugangsdaten prüfen.", 503
        if not stream_started:
            emit({"ok": False, "error": message, "status": status_code})
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
