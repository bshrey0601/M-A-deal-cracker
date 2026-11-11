import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  /** What the wrapped section is, for the message (e.g. "Football field"). */
  label: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Stops one section's rendering error from blanking the whole app: React unmounts everything
 * above an uncaught render error, so each panel and each data-driven module sits inside one of these.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  // Declared explicitly because the project has no React type package, so the base class is untyped.
  declare props: Props;
  declare setState: (s: State) => void;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`${this.props.label} failed to render:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="bg-accent-red/5 border border-accent-red/30 rounded-xl p-5 text-sm">
        <div className="flex items-center gap-2 font-bold text-accent-red">
          <AlertTriangle size={16} /> {this.props.label} couldn't be shown
        </div>
        <p className="text-text-secondary text-xs mt-2">
          Something in this company's data broke this section ({this.state.error.message}). The rest of the app still works.
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-3 px-3 py-1.5 border border-border-alt rounded-md text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:bg-bg-alt"
        >
          Try again
        </button>
      </div>
    );
  }
}
