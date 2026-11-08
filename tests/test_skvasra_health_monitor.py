"""Offline tests; never use production network or credentials."""
import importlib.util
import io
import pathlib
import unittest
from unittest.mock import patch

MODULE_FILE = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "check_skvasra_health.py"
spec = importlib.util.spec_from_file_location("skvasra_health", MODULE_FILE)
health = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = health
spec.loader.exec_module(health)


class FakeResponse:
    status = 200

    def __init__(self, payload: bytes, status=200):
        self.payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, length):
        return self.payload[:length]


class MonitorTests(unittest.TestCase):
    def test_valid_site(self):
        self.assertIn("SK VASRA", health._validate_page(
            b"<!doctype html><html><title>SK VASRA</title></html>"))

    def test_rejects_fake_site(self):
        with self.assertRaises(health.HealthCheckError):
            health._validate_page(b"<html>not our website</html>")

    def test_valid_database_response(self):
        self.assertIn("1 public Sitios", health._validate_database(
            b'{"sitios":[{"id":"a","name":"Palanas A"}]}'))

    def test_empty_list_is_healthy(self):
        self.assertIn("0 public Sitios", health._validate_database(b'{"sitios":[]}'))

    def test_rejects_incomplete_or_bad_json(self):
        for body in [b'{"error":"DB is paused"}', b'<!doctype html>', b'{"sitios":{}}',
                     b'{"sitios":[{"id":123,"name":"No"}]}']:
            with self.subTest(body=body), self.assertRaises(health.HealthCheckError):
                health._validate_database(body)

    def test_uses_https_get_nocache_headers_and_timeout(self):
        calls = []

        def opener(req, timeout):
            calls.append((req, timeout))
            return FakeResponse(b'{"sitios":[]}')
        result = health.check_endpoint(
            "database", health.DATABASE_ENDPOINT, health._validate_database,
            opener=opener, sleep=lambda _: None)
        self.assertEqual(result.name, "database")
        req, timeout = calls[0]
        self.assertEqual(req.get_method(), "GET")
        self.assertEqual(timeout, 15)
        self.assertEqual(req.get_header("Cache-control"), "no-cache")
        self.assertNotIn("Authorization", req.headers)

    def test_rejects_insecure_url(self):
        with self.assertRaises(health.HealthCheckError):
            health.check_endpoint("bad", "http://example.org/",
                                  health._validate_page,
                                  opener=lambda *_a, **_k: None,
                                  sleep=lambda _: None)

    def test_transient_error_retries_once(self):
        requests = []

        def opener(req, timeout):
            requests.append(req)
            if len(requests) == 1:
                raise TimeoutError("temporary")
            return FakeResponse(b'{"sitios":[]}')
        result = health.check_endpoint("database", health.DATABASE_ENDPOINT,
                                       health._validate_database,
                                       opener=opener, sleep=lambda _: None)
        self.assertEqual(result.name, "database")
        self.assertEqual(len(requests), 2)

    def test_permanent_error_has_bounded_retries(self):
        calls = []
        def opener(req, timeout):
            calls.append(req)
            return FakeResponse(b"bad", status=503)
        with self.assertRaises(health.HealthCheckError):
            health.check_endpoint("database", health.DATABASE_ENDPOINT,
                                  health._validate_database,
                                  opener=opener, sleep=lambda _: None)
        self.assertEqual(len(calls), 2)

    def test_checks_both_domains_and_real_database_shape(self):
        called = []
        def opener(req, timeout):
            called.append(req.full_url)
            if "/api/kk/sitios" in req.full_url:
                return FakeResponse(b'{"sitios":[{"id":"a","name":"Palanas A"}]}')
            return FakeResponse(b"<!doctype html><html>SK VASRA</html>")
        with patch("builtins.print"):
            results = health.run_checks(opener=opener, sleep=lambda _: None, stamp=lambda: 123)
        self.assertEqual(len(results), 3)
        self.assertEqual(len(called), 3)
        self.assertTrue(called[2].endswith("health_check=123"))

    def test_network_errors_fail_overall_check(self):
        def opener(req, timeout):
            if "vasra.vercel.app" in req.full_url:
                raise TimeoutError("offline")
            if "/api/kk/sitios" in req.full_url:
                return FakeResponse(b'{"sitios":[]}')
            return FakeResponse(b"<!doctype html><html>SK VASRA</html>")
        with patch("builtins.print"), self.assertRaises(health.HealthCheckError):
            health.run_checks(opener=opener, sleep=lambda _: None, stamp=lambda: 123)

    def test_response_size_is_limited(self):
        def opener(req, timeout):
            return FakeResponse(b'x' * (health.MAX_RESPONSE_BYTES + 1))
        with self.assertRaises(health.HealthCheckError):
            health.check_endpoint("oversize", health.CUSTOM_SITE,
                                  health._validate_page,
                                  opener=opener, sleep=lambda _: None)


if __name__ == "__main__":
    unittest.main()
