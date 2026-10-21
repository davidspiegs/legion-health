import { Component, type ErrorInfo, type ReactNode } from "react";
import { LegionMark } from "./parts";
import { STORAGE_KEY } from "./state";

/** If a saved conversation can't be drawn, offer a clean start instead of a blank page. */
export class ChatBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        style={{ display: "grid", placeItems: "center", alignContent: "center", gap: 14, padding: 32, minHeight: "100%", textAlign: "center" }}
      >
        <LegionMark className="chat-mark" />
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Something went wrong showing your conversation.</p>
        <p style={{ margin: 0, color: "var(--muted)", maxWidth: 340 }}>
          This preview keeps your answers only in this browser. Starting over clears them.
        </p>
        <button
          type="button"
          className="chip primary"
          onClick={() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              /* Nothing stored to clear. */
            }
            window.location.reload();
          }}
        >
          Start over
        </button>
      </div>
    );
  }
}

