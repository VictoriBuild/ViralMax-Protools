import { Component, type ErrorInfo, type ReactNode } from "react"

interface ErrorBoundaryState {
  message: string | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { message: error.message || "The desktop UI crashed while starting." }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Renderer crashed", error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.message) {
      return this.props.children
    }
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif", color: "#e4e4e7", background: "#09090b", minHeight: "100vh" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>ViralMax failed to start</h1>
        <p style={{ opacity: 0.8 }}>{this.state.message}</p>
      </div>
    )
  }
}
