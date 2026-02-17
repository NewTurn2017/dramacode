import { toast, Toaster } from "solid-toast"

const baseStyle = {
  background: "var(--color-bg-card)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  "border-radius": "8px",
  "box-shadow": "0 4px 12px rgba(0, 0, 0, 0.5)",
  "font-family": "var(--font-sans)",
  padding: "12px 16px",
}

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      gutter={8}
      toastOptions={{ duration: 3000, style: baseStyle }}
    />
  )
}

export const showToast = Object.assign(
  (message: string) => {
    toast(message, { style: { ...baseStyle, "border-left": "4px solid var(--color-accent)" } })
  },
  {
    success: (message: string) => {
      toast.success(message, { style: { ...baseStyle, "border-left": "4px solid var(--color-success)" } })
    },
    error: (message: string) => {
      toast.error(message, { style: { ...baseStyle, "border-left": "4px solid var(--color-danger)" } })
    },
  },
)
