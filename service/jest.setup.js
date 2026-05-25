// =============================================================================
// Jest Global Setup — Executes BEFORE any module is imported or evaluated
// =============================================================================
// This file is referenced via the "setupFiles" array in jest.config.js.
// Jest runs it at the very start of the process, guaranteeing that
// process.env values are locked in before ioredis (or any other module)
// reads them during ES module instantiation.
//
// Password MUST match docker-compose.dev.yml → --requirepass dev_password_123
// =============================================================================

process.env.NODE_ENV = "test";
process.env.ADMIN_API_KEY = "dev_admin_secret_key_987654321";
process.env.REDIS_URL = "redis://:dev_password_123@127.0.0.1:6379";
