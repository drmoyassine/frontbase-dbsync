import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  componentId?: string;
  componentType?: string;
  onRemove?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Component-level error boundary for the Builder canvas.
 * Wraps each ComponentRenderer so a crash in one component
 * does NOT take down the entire canvas.
 */
export class ComponentErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[ComponentErrorBoundary] ${this.props.componentType || 'Unknown'}(${this.props.componentId || '?'}) crashed:`,
      error,
      errorInfo
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-destructive/50 bg-destructive/5 rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-medium">
              {this.props.componentType || 'Component'} failed to render
            </span>
          </div>
          <p className="text-xs text-muted-foreground pl-6 break-all">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <div className="flex gap-2 pl-6">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
            {this.props.onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={this.props.onRemove}
                className="h-7 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Remove
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
