using Workerd = import "/workerd/workerd.capnp";
# Synthetic only. No internet service: every outbound request goes to the mock.
const config :Workerd.Config = (
  services = [
    (name = "main", worker = (
      modules = [(name = "fixture.mjs", esModule = embed "fixture.mjs"), (name = "newsletter.mjs", esModule = embed "../../server/newsletter.mjs")],
      compatibilityDate = "2024-01-01", globalOutbound = "mock"
    )),
    (name = "mock", worker = (
      modules = [(name = "mock.mjs", esModule = embed "mock.mjs"), (name = "newsletter.mjs", esModule = embed "../../server/newsletter.mjs")],
      compatibilityDate = "2024-01-01", globalOutbound = "mock"
    ))
  ],
  sockets = [(name = "http", address = "127.0.0.1:0", http = (), service = "main")]
);
