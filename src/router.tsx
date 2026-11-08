import { createBrowserRouter } from "react-router"

import { GuestCodeEntry, GuestRoute } from "@/routes/guest"
import { HomeRoute } from "@/routes/home"
import { RootLayout } from "@/routes/root-layout"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomeRoute />,
      },
      {
        // Read-only alliance partner view, no account needed
        path: "guest",
        element: <GuestCodeEntry />,
      },
      {
        path: "guest/:code",
        element: <GuestRoute />,
      },
    ],
  },
])
