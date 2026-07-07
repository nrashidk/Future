import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/config";

// Promote the async Google Fonts stylesheet from media="print" to "all" once it
// loads. This replaces the inline onload="this.media='all'" handler in index.html,
// which CSP's script-src-attr 'none' blocks. The l.sheet check handles the case
// where the stylesheet already finished loading before this module ran.
document.querySelectorAll<HTMLLinkElement>("link.async-font").forEach((l) => {
  if (l.sheet) {
    l.media = "all";
  } else {
    l.addEventListener("load", () => {
      l.media = "all";
    });
  }
});

createRoot(document.getElementById("root")!).render(<App />);
