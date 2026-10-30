import { defineConfig } from 'vitest/config'
export default defineConfig({root:new URL('..',import.meta.url).pathname,resolve:{alias:{'@hermes/plugin-sdk':new URL('./sdk.mjs',import.meta.url).pathname}},test:{environment:'jsdom',include:['tests/*.test.mjs']}})
