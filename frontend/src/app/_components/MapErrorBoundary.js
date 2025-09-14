'use client';

import { Component } from 'react';

class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Map Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-96 bg-red-50 border border-red-200 rounded flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-600 font-semibold mb-2">Map Error</div>
            <div className="text-red-500 text-sm">
              Failed to load map. Please refresh the page.
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default MapErrorBoundary;
