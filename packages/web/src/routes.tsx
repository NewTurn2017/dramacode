import { lazy } from "solid-js"
import type { RouteDefinition } from "@solidjs/router"

const Dashboard = lazy(() => import("./pages/dashboard"))
const DramaWorkspace = lazy(() => import("./pages/drama"))
const WriterPage = lazy(() => import("./pages/writer"))

export const routes: (RouteDefinition & { icon: string; label: string })[] = [
  { path: "/", component: Dashboard, icon: "", label: "대시보드" },
  { path: "/writer", component: WriterPage, icon: "", label: "작가 프로필" },
]

export const hiddenRoutes: RouteDefinition[] = [{ path: "/drama/:id", component: DramaWorkspace }]
