"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="card max-w-lg text-center">
            <h1 className="text-xl font-bold">Giao diện gặp lỗi</h1>
            <p className="muted mt-2">Không phải lỗi giọng nói — bạn có thể tải lại trang.</p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-left text-xs text-rose-300">
              {this.state.error.message}
            </pre>
            <button className="btn-primary mt-4" onClick={() => window.location.reload()}>
              Tải lại trang
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
