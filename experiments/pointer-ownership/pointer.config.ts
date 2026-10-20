import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

// Copied beside the existing browser config by the experiment workflow.
// Pointer ownership needs the normal page fixture, but no downloaded splats.
export default defineConfig({
  ...base,
  globalSetup: undefined,
  testMatch: "pointer-ownership.test.ts",
});
