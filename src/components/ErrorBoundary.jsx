/**
 * ErrorBoundary Component - PPP SalesMagic Connector
 * Production-grade React error boundary with structured logging
 * Follows .cursorrules specification for error capture and logging
 */

import React from 'react';
import logger from '../utils/logger.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error with structured logging
    logger.error('React Error Boundary', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      componentStack: errorInfo.componentStack,
      component: this.props.componentName || 'Unknown',
      errorBoundary: true,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server',
      url: typeof window !== 'undefined' ? window.location.href : 'Server',
      timestamp: new Date().toISOString(),
      ...this.props.context
    });

    // Store error info for display
    this.setState({
      error,
      errorInfo
    });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    
    // Log retry attempt
    logger.info('Error Boundary Retry', {
      component: this.props.componentName || 'Unknown',
      action: 'retry',
      errorBoundary: true
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      // Default fallback UI
      return (
        <div style={{
          padding: '20px',
          margin: '20px 0',
          border: '1px solid #ff6b6b',
          borderRadius: '4px',
          backgroundColor: '#fff5f5',
          color: '#c92a2a'
        }}>
          <h2>Something went wrong</h2>
          <p>We're sorry, but an unexpected error occurred.</p>
          
          {this.props.showDetails && this.state.error && (
            <details style={{ marginTop: '10px' }}>
              <summary>Error Details</summary>
              <pre style={{
                fontSize: '12px',
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                overflow: 'auto'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.defaultProps = {
  componentName: 'ErrorBoundary',
  showDetails: false, // Set to true in development
  context: {}
};

export default ErrorBoundary; 