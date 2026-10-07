import { Component, type ReactNode } from "react";

/** Keeps one broken simulation from taking down the whole page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="callout bad">
          💥 This simulation crashed: <span className="mono">{this.state.error.message}</span>{" "}
          <button className="btn small" onClick={() => this.setState({ error: null })}>
            Restart it
          </button>
        </div>
      );
    return this.props.children;
  }
}
