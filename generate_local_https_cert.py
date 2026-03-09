from __future__ import annotations

import argparse
import ipaddress
import socket
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a local CA and server certificate for Progress Atlas HTTPS serving.",
    )
    parser.add_argument(
        "--cert-dir",
        default="certs",
        help="Directory where certificate files will be written.",
    )
    parser.add_argument(
        "--ip",
        action="append",
        default=[],
        help="IPv4 address to include in the server certificate SAN.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate certificates even if they already exist.",
    )
    return parser.parse_args()


def build_subject(common_name: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "JP"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Progress Atlas Local"),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ],
    )


def write_pem(path: Path, data: bytes) -> None:
    path.write_bytes(data)


def write_der(path: Path, cert: x509.Certificate) -> None:
    path.write_bytes(cert.public_bytes(serialization.Encoding.DER))


def unique_hostnames() -> list[str]:
    names = {"localhost", socket.gethostname()}
    try:
        fqdn = socket.getfqdn()
        if fqdn:
            names.add(fqdn)
    except OSError:
        pass
    return sorted(name for name in names if name)


def build_ca(cert_dir: Path, force: bool) -> tuple[Path, Path, x509.Certificate, rsa.RSAPrivateKey]:
    ca_key_path = cert_dir / "progress-atlas-local-ca-key.pem"
    ca_cert_path = cert_dir / "progress-atlas-local-ca-cert.pem"
    ca_cert_der_path = cert_dir / "progress-atlas-local-ca-cert.cer"

    if not force and ca_key_path.exists() and ca_cert_path.exists() and ca_cert_der_path.exists():
        ca_key = serialization.load_pem_private_key(ca_key_path.read_bytes(), password=None)
        ca_cert = x509.load_pem_x509_certificate(ca_cert_path.read_bytes())
        return ca_key_path, ca_cert_path, ca_cert, ca_key

    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    ca_subject = build_subject("Progress Atlas Local CA")

    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_subject)
        .issuer_name(ca_subject)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=False,
                key_cert_sign=True,
                key_agreement=False,
                content_commitment=False,
                data_encipherment=False,
                encipher_only=False,
                decipher_only=False,
                crl_sign=True,
            ),
            critical=True,
        )
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
        .sign(private_key=ca_key, algorithm=hashes.SHA256())
    )

    write_pem(
        ca_key_path,
        ca_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ),
    )
    write_pem(ca_cert_path, ca_cert.public_bytes(serialization.Encoding.PEM))
    write_der(ca_cert_der_path, ca_cert)

    return ca_key_path, ca_cert_path, ca_cert, ca_key


def build_server(
    cert_dir: Path,
    ca_cert: x509.Certificate,
    ca_key: rsa.RSAPrivateKey,
    hostnames: list[str],
    ip_strings: list[str],
) -> tuple[Path, Path]:
    server_key_path = cert_dir / "progress-atlas-server-key.pem"
    server_cert_path = cert_dir / "progress-atlas-server-cert.pem"

    server_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    subject = build_subject(hostnames[0] if hostnames else "localhost")

    alt_names: list[x509.GeneralName] = [x509.DNSName(name) for name in hostnames]
    alt_names.extend(
        x509.IPAddress(ipaddress.ip_address(ip_text))
        for ip_text in sorted(set(ip_strings))
    )

    server_cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_cert.subject)
        .public_key(server_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                key_cert_sign=False,
                key_agreement=False,
                content_commitment=False,
                data_encipherment=False,
                encipher_only=False,
                decipher_only=False,
                crl_sign=False,
            ),
            critical=True,
        )
        .sign(private_key=ca_key, algorithm=hashes.SHA256())
    )

    write_pem(
        server_key_path,
        server_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ),
    )
    write_pem(server_cert_path, server_cert.public_bytes(serialization.Encoding.PEM))

    return server_key_path, server_cert_path


def main() -> None:
    args = parse_args()
    cert_dir = Path(args.cert_dir).resolve()
    cert_dir.mkdir(parents=True, exist_ok=True)

    ip_strings = {"127.0.0.1"}
    for ip_text in args.ip:
        try:
            ip_strings.add(str(ipaddress.ip_address(ip_text)))
        except ValueError:
            pass

    hostnames = unique_hostnames()
    _, ca_cert_path, ca_cert, ca_key = build_ca(cert_dir, args.force)
    server_key_path, server_cert_path = build_server(
        cert_dir=cert_dir,
        ca_cert=ca_cert,
        ca_key=ca_key,
        hostnames=hostnames,
        ip_strings=sorted(ip_strings),
    )

    print(f"CA_CERT={ca_cert_path}")
    print(f"CA_CERT_DER={cert_dir / 'progress-atlas-local-ca-cert.cer'}")
    print(f"SERVER_CERT={server_cert_path}")
    print(f"SERVER_KEY={server_key_path}")
    print(f"SAN_HOSTS={','.join(hostnames)}")
    print(f"SAN_IPS={','.join(sorted(ip_strings))}")


if __name__ == "__main__":
    main()
