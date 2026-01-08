import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#13182b] group-[.toaster]:text-white group-[.toaster]:border-gray-700 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-400",
          actionButton:
            "group-[.toast]:bg-blue-600 group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-gray-700 group-[.toast]:text-gray-300",
          error: "group-[.toast]:bg-red-950 group-[.toast]:text-red-400 group-[.toast]:border-red-800",
          success: "group-[.toast]:bg-green-950 group-[.toast]:text-green-400 group-[.toast]:border-green-800",
          warning: "group-[.toast]:bg-yellow-950 group-[.toast]:text-yellow-400 group-[.toast]:border-yellow-800",
          info: "group-[.toast]:bg-blue-950 group-[.toast]:text-blue-400 group-[.toast]:border-blue-800",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
