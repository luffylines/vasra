#!/usr/bin/env python3
"""Read-only availability check for SK VASRA on Vercel and Supabase.

Checks both first-party Vercel domains and verifies an actual Supabase-backed
read using the application's existing public Sitio endpoint. No API key, login
session, DB write, or new database objects are needed.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

CUSTOM_SITE = "https://www.skvasra.app/"
OLD_SITE = "https://vasra.vercel.app/"
DATABASE_ENDPOINT = "https://www.skvasra.app/api/kk/sitios"
TIMEOUT_SECONDS = 15
MAX_RESPONSE_BYTES = 128 * 1024


class HealthCheckError(RuntimeError):
    """Safe-to-log health check failure without leaking response content."""


@dataclass(frozen=True)
class HealthResult:
    name: str
    detail: str


def _read_response(url: str, opener: Callable, timeout: int) -> bytes:
    if not url.startswith("https://"):
        raise HealthCheckError("HTTPS is required")
    req = Request(url, method="GET", headers={
        "Accept": "application/json" if "/api/" in url else "text/html",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": "SKVASRA-FreeHealthMonitor/1.0",
    })
    with opener(req, timeout=timeout) as response:
        if response.status != 200:
            raise HealthCheckError(f"HTTP {response.status}, expected 200")
        payload = response.read(MAX_RESPONSE_BYTES + 1)
        if len(payload) > MAX_RESPONSE_BYTES:
            raise HealthCheckError("Response exceeded safe size limit")
        return payload


def _validate_page(raw: bytes) -> str:
    page = raw.decode("utf-8", errors="replace")
    lower = page.lower()
    if "<!doctype html>" not in lower or "<html" not in lower:
        raise HealthCheckError("Site returned non-HTML or incomplete content")
    if "vasra" not in lower:
        raise HealthCheckError("Expected SK VASRA content was missing")
    return "HTML page and SK VASRA brand returned"


def _validate_database(raw: bytes) -> str:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HealthCheckError("Supabase-backed endpoint returned invalid JSON") from None
    if not isinstance(data, dict) or not isinstance(data.get("sitios"), list):
        raise HealthCheckError("Database response was missing the Sitio list")
    sitios = data["sitios"]
    if not all(isinstance(s, dict)
               and isinstance(s.get("id"), str)
               and isinstance(s.get("name"), str) for s in sitios):
        raise HealthCheckError("Database response contained invalid Sitio entries")
    return f"Read-only Supabase query succeeded ({len(sitios)} public Sitios)"


def check_endpoint(name: str, url: str, validate: Callable[[bytes], str],
                   opener: Callable = urlopen, sleep: Callable = time.sleep,
                   timeout: int = TIMEOUT_SECONDS) -> HealthResult:
    """At most two read-only GET requests per endpoint, with a brief retry."""
    error: Exception | None = None
    for attempt in range(2):
        try:
            return HealthResult(name, validate(_read_response(url, opener, timeout)))
        except (HealthCheckError, HTTPError, URLError, TimeoutError, OSError,
                UnicodeError, ValueError) as exc:
            error = exc
            if attempt == 0:
                sleep(1)
    raise HealthCheckError(f"{name}: {type(error).__name__}: {error}") from None


def run_checks(opener: Callable = urlopen,
               sleep: Callable = time.sleep,
               stamp: Callable = time.time) -> list[HealthResult]:
    # The query value defeats intermediate caches; the Vercel handler performs
    # its existing read-only RPC and returns a public, non-sensitive result.
    cache_buster = urlencode({"health_check": str(int(stamp()))})
    targets = [
        ("Vercel custom domain", CUSTOM_SITE, _validate_page),
        ("Vercel legacy domain", OLD_SITE, _validate_page),
        ("Supabase database via Vercel", DATABASE_ENDPOINT + "?" + cache_buster,
         _validate_database),
    ]
    results: list[HealthResult] = []
    failures: list[str] = []
    for name, url, validate in targets:
        try:
            result = check_endpoint(name, url, validate, opener=opener, sleep=sleep)
            results.append(result)
            print(f"OK {result.name}: {result.detail}", flush=True)
        except HealthCheckError as exc:
            failures.append(str(exc))
            print(f"FAIL {name}: check could not complete", file=sys.stderr,
                  flush=True)
    if failures:
        # Never print response body, user data, credentials or headers.
        raise HealthCheckError("; ".join(failures))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        run_checks()
    except HealthCheckError as exc:
        print(f"SKVASRA health monitor FAILED: {exc}", file=sys.stderr)
        return 1
    print("SKVASRA health monitor PASSED: Vercel and Supabase are responding.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
