import React from 'react';
import { capturePlayerRuntimeError } from '../services/playerReportService';
import { reloadFromLastSafeState } from '../services/deploymentUpdateService';

interface AppErrorBoundaryState {
  failed: boolean;
  reportId: string | null;
}

/**
 * Last-resort recovery surface for React render failures. The normal global
 * monitor catches browser/runtime faults; this boundary ensures a component
 * failure also leaves the player with a usable reload action.
 */
class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false, reportId: null };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true, reportId: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const reportId = capturePlayerRuntimeError(error, {
      source: 'react_error_boundary',
      component_stack: info.componentStack || ''
    });
    if (reportId) this.setState({ reportId });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="grid min-h-[100svh] place-items-center bg-[#020617] p-5 text-white">
        <section
          role="alert"
          className="w-full max-w-md rounded-[8px] border border-red-300/35 bg-slate-950 p-6 text-center shadow-[0_0_52px_rgba(248,113,113,0.18)]"
        >
          <p className="font-mono text-[0.65rem] font-black uppercase tracking-[0.18em] text-red-200">
            Flight system recovery
          </p>
          <h1 className="mt-2 text-2xl font-black">The game hit an unexpected error.</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {this.state.reportId
              ? 'A bounded diagnostic report was queued for delivery. '
              : ''}
            Reloading keeps your safely stored progress and resets the temporary wallet connection.
          </p>
          {this.state.reportId ? (
            <p className="mt-3 break-all font-mono text-[0.65rem] text-cyan-200">
              Report {this.state.reportId}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reloadFromLastSafeState()}
            className="mt-5 min-h-11 w-full rounded-[6px] border border-cyan-200/40 bg-cyan-300/15 px-4 py-2 font-black text-cyan-50 transition hover:bg-cyan-300/25"
          >
            Reload game
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
