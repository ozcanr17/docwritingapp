import { Component, ErrorInfo, ReactNode } from "react";
import { withTranslation, WithTranslation } from "react-i18next";

interface State {
  failed: boolean;
}

class ChunkErrorBoundaryComponent extends Component<WithTranslation & { children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    globalThis.dispatchEvent(new CustomEvent("docsys:client-error", { detail: { message: error.message, stack: info.componentStack } }));
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold">{this.props.t("clientError")}</h1>
          <p className="mt-2 text-sm text-mutedForeground">{this.props.t("chunkLoadError")}</p>
          <button className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm text-primaryForeground" onClick={() => globalThis.location.reload()}>
            {this.props.t("reload")}
          </button>
        </div>
      </div>
    );
  }
}

export const ChunkErrorBoundary = withTranslation()(ChunkErrorBoundaryComponent);
