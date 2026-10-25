/* Preloaded into the Node servers so *.e2e.test resolves to loopback (mirrors Chromium's host-resolver-rules). */
const dns = require("node:dns");
const original = dns.lookup;
const mapped = (host) => typeof host === "string" && (host === "e2e.test" || host.endsWith(".e2e.test"));
dns.lookup = function lookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? {} : options || {};
  if (!mapped(hostname)) return original.call(dns, hostname, options, callback);
  if (opts.all) return process.nextTick(cb, null, [{ address: "127.0.0.1", family: 4 }]);
  return process.nextTick(cb, null, "127.0.0.1", 4);
};
