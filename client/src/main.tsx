import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";

const PUBLISHABLE_KEY = publishableKeyFromHost(
    window.location.hostname,
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  );
const CLERK_PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        console.log("[SW] Registered, scope:", reg.scope);
        reg.update().catch(() => {});
        if (hadController) {
          let refreshing = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
          });
        }
      })
      .catch((err) => console.warn("[SW] Registration failed:", err));
  });
}

const root = createRoot(document.getElementById("root")!);

if (!PUBLISHABLE_KEY) {
  root.render(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: "24px",
        fontFamily: "sans-serif",
        textAlign: "center",
        gap: "16px",
      }}
    >
      <p style={{ fontSize: "20px", fontWeight: 700 }}>Setup Required</p>
      <p style={{ fontSize: "15px", color: "#555", maxWidth: "360px" }}>
        Managed sign-in is not available in this environment. Restart the preview or publish
        the app to refresh its managed authentication configuration.
      </p>
    </div>
  );
} else {
  root.render(
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      proxyUrl={CLERK_PROXY_URL}
      afterSignOutUrl="/"
    >
      <App />
    </ClerkProvider>
  );
}
