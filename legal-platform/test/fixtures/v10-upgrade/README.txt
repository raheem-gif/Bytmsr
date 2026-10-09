v92-demo.db.gz — a real 9.2.0 demo database (built with the 9.2.0 code and its demo seed, then a saved
security_totp_issuer «My Firm Saved»), used by the G-4 upgrade rehearsal in test/v10-b2b-server.test.js:
10.0 starts twice on a copy of it; PRAGMA foreign_key_check stays empty, schema 80–85 is added, the saved
issuer is kept, and no message or AI call is caused by the upgrade. Fictional demo data only; the
encryption key (.secret-key) of that install is not included.
