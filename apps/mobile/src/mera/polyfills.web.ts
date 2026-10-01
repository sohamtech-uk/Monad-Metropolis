/**
 * Browser host functions need their Window receiver. The shared native/web
 * service clients retain fetch as an instance property; normalising it here
 * prevents an "Illegal invocation" when called as client.fetchImpl(...).
 *
 * This entry is selected only by Expo Web. Native crypto polyfills and mobile
 * payment behaviour remain unchanged. Browser Web Crypto is not replaced.
 */
const browserFetch = globalThis.fetch;

if (typeof browserFetch === "function") {
  globalThis.fetch = browserFetch.bind(globalThis);
}

export {};
